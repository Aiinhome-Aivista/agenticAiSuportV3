from flask import Flask, request, jsonify, render_template,send_from_directory
import google.generativeai as genai
import pyodbc
from difflib import get_close_matches,SequenceMatcher
import os
from gtts import gTTS
import json
import uuid
from threading import Thread
import smtplib
import pandas as pd
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

app = Flask(__name__, static_folder='static')


# ========== 1. Gemini API Config ==========
genai.configure(api_key="AIzaSyBfvML7alBtBG56ipGD7FS4s8sFraOlJIM")
model = genai.GenerativeModel(model_name="gemini-1.5-flash")
TEMP_FOLDER = "./static/Temp"
# TEMP_AUDIO_PATH = os.path.join(TEMP_FOLDER, "speech.mp3")
TEMP_AUDIO_PATH = os.path.join("static", "Temp", "speech.mp3")

os.makedirs(TEMP_FOLDER, exist_ok=True)
FROM_EMAIL = "debasishsahoo510@gmail.com" 
EMAIL_PASSWORD = "ciqa ryfz zhjt ugzk"
# TEMP_AUDIO_PATH = "response_audio.mp3"
# ========== 2. SQL Server Connection ==========
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=122.163.121.176,3050;"
    "DATABASE=Agentic_ai_poc;"
    "UID=Developer1;"
    "PWD=Aiinhome@123"
)
cursor = conn.cursor()

# ========== 3. In-Memory Session Store ==========
session_context = {}

# ========== 4. Helper Functions ==========
def get_static_audio_uri():
    return "/static/Temp/speech.mp3"


def generate_audio(text, lang="en"):
    try:
        sound = gTTS(text=text, lang=lang, tld='co.in')
        sound.save(TEMP_AUDIO_PATH)
    except Exception as e:
        print("gTTS Error:", e)

def get_filtered_faq_dataframe(company_module_map):
    table_map = {
        "salesforce": "salesforce_support_dataset",
        "o9": "o9_support_dataset"
    }

    combined_df = pd.DataFrame()

    for entry in company_module_map:
        company = entry.get("name", "").lower().strip()
        modules = entry.get("modules", [])
        table_name = table_map.get(company)

        if not table_name or not modules:
            print(f"[Warning] Invalid company or empty modules: {company}")
            continue

        placeholders = ', '.join(['?'] * len(modules))
        query = f"""
            SELECT topic_keyword, point_user_manual, point_user_manual_description,
                   faq_module, faq_sub_module, question_faq, answer_faq
            FROM {table_name}
            WHERE app_module IN ({placeholders})
        """
        try:
            cursor.execute(query, modules)
            rows = cursor.fetchall()
            columns = [column[0] for column in cursor.description]
            df = pd.DataFrame.from_records(rows, columns=columns)
            combined_df = pd.concat([combined_df, df], ignore_index=True)
        except Exception as e:
            print(f"[Error] Query failed for {table_name}: {e}")

    return combined_df

def find_best_match(user_question, faq_rows, faq_questions):
    raw_match = get_close_matches(user_question, faq_questions, n=1, cutoff=0.6)
    if raw_match:
        for row in faq_rows:
            if row["question_faq"] == raw_match[0]:
                return row, "Matched using raw input"

    rephrase_prompt = f'Rewrite this as a complete natural language question: "{user_question}"'
    rewritten_question = model.generate_content(rephrase_prompt).text.strip()

    refined_match = get_close_matches(rewritten_question, faq_questions, n=1, cutoff=0.6)
    if refined_match:
        for row in faq_rows:
            if row["question_faq"] == refined_match[0]:
                return row, f"Rephrased to: {rewritten_question}"

    return None, rewritten_question

def extract_name_and_email(input_text):
    prompt = f"""
You are an intelligent assistant. Extract the full name and email address from the following input text:

Input: "{input_text}"

Return the result strictly in this JSON format:
{{
  "name": "Full Name Here or null if not found",
  "email": "Email Here or null if not found"
}}
Only return the JSON, no explanation.
"""
    try:
        response = model.generate_content(prompt)
        text = response.text.strip().replace("```json", "").replace("```", "").strip()
        result = json.loads(text)
        name = result.get("name")
        email = result.get("email")
        return name if name != "null" else None, email if email != "null" else None
    except Exception as e:
        print(f"Gemini Extraction Error: {e}")
        return None, None

def generate_ai_greeting(name):
    prompt = f"""
You are a smart assistant helping users of the Salesforce organization's User Management Module Support System.

Greet the user formally with this style:
"Hello [Full Name]. You are currently using the Salesforce organization's User Management Module Support System. How can I help you?"

If the name is missing, just say:
"Hello there. You are currently using the Salesforce organization's User Management Module Support System. How can I help you?"

Input Name: "{name}"

Output: Provide only the greeting text. Do not include any explanation or formatting like triple backticks.
"""
    try:
        response = model.generate_content(prompt)
        return response.text.strip().replace("```", "").strip()
    except Exception as e:
        print(f"Greeting generation error: {e}")
        return "Hello there. You are currently using the Salesforce organization's User Management Module Support System. How can I help you?"

# ========== 5. Ask Endpoint ==========
@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()
    session_id = str(data.get("id", "")).strip()
    user_question = data.get("question", "").strip()
    email = data.get("email", "").strip()
    companies = data.get("companies", [])

    if not session_id or not user_question or not email or not companies:
        return jsonify({"error": "Missing required fields"}), 400

    if session_id not in session_context:
        session_context[session_id] = []

    faq_df = get_filtered_faq_dataframe(companies)
    if faq_df.empty:
        fallback_msg = "You don't have access to this information."
        generate_audio(fallback_msg)
        return jsonify({
            "matched": False,
            "intent": "No matching company/module found",
            "generated_answer": fallback_msg,
            # "audio_file": TEMP_AUDIO_PATH,
            "audio_file": get_static_audio_uri(),
            "session_turns": len(session_context[session_id])
        })

    faq_rows = faq_df.to_dict("records")
    faq_questions = faq_df["question_faq"].dropna().tolist()

    history_prompt = ""
    for i, q in enumerate(session_context[session_id], 1):
        history_prompt += f"Turn {i}:\nQ: {q['question']}\nA: {q['summary']}\n"

    matched_row, intent_info = find_best_match(user_question, faq_rows, faq_questions)

    if matched_row:
        full_info = f"""
        Topic Keyword: {matched_row['topic_keyword']}
        Manual Point: {matched_row['point_user_manual']}
        Manual Description: {matched_row['point_user_manual_description']}
        FAQ Question: {matched_row['question_faq']}
        FAQ Answer: {matched_row['answer_faq']}
        """
        summary_prompt = f"""
        You are a Salesforce assistant. The user is in an ongoing session. Here's the conversation so far:

        {history_prompt}

        Now, the user asked: "{user_question}"

        Based on the matched support content below and context, write a short, clear, helpful answer:

        {full_info}
        """
        summary = model.generate_content(summary_prompt).text.strip()

        session_context[session_id].append({
            "question": user_question,
            "summary": summary
        })

        generate_audio(summary)

        return jsonify({
            "matched": True,
            "intent": intent_info,
            "faq_question": matched_row['question_faq'],
            "faq_answer": matched_row['answer_faq'],
            "summary": summary,
            # "audio_file": TEMP_AUDIO_PATH,
            "audio_file": get_static_audio_uri(),
            "session_turns": len(session_context[session_id])
        })

    else:
        fallback_msg = "You don't have access to this information."
        generate_audio(fallback_msg)
        session_context[session_id].append({
            "question": user_question,
            "summary": fallback_msg
        })
        return jsonify({
            "matched": False,
            "intent": intent_info,
            "generated_answer": fallback_msg,
            # "audio_file": TEMP_AUDIO_PATH,
            "audio_file": get_static_audio_uri(),
            "session_turns": len(session_context[session_id])
        })

    


# ---------- Classify Modules to Companies ----------
def classify_modules(app_module_str):
    modules = [m.strip() for m in app_module_str.split(",") if m.strip()]
    salesforce_modules = set()
    o9_modules = set()

    try:
        cursor = conn.cursor()
        for module in modules:
            # Salesforce check
            cursor.execute("SELECT 1 FROM salesforce_support_dataset WHERE app_module = ?", (module,))
            if cursor.fetchone():
                salesforce_modules.add(module)
            # o9 check
            cursor.execute("SELECT 1 FROM o9_support_dataset WHERE app_module = ?", (module,))
            if cursor.fetchone():
                o9_modules.add(module)
    except Exception as e:
        print("Module classification error:", e)

    companies = []
    if salesforce_modules:
        companies.append({
            "name": "Salesforce",
            "modules": sorted(list(salesforce_modules))
        })
    if o9_modules:
        companies.append({
            "name": "o9",
            "modules": sorted(list(o9_modules))
        })

    return companies

# ---------- AI Greeting Summary ----------
def generate_summary(first_name, companies):
    prompt = f"""
You are a helpful assistant. Write a natural, friendly greeting message.

The person's first name is: {first_name}

The user has access to the following modules:
{json.dumps(companies)}

Format:
"Hi [First Name], you are authorized to use [modules] of [company1] and [modules] of [company2]. Let me know how can I help you?"

Only return the greeting sentence.
"""
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        return response.text.strip().replace("```", "")
    except Exception as e:
        print("AI Summary Error:", e)
        return f"Hi {first_name}, how can I help you?"

# ---------- Text-to-Speech ----------
def speak_text(text, lang="en"):
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        temp_dir = os.path.join(base_dir, "static", "Temp")
        os.makedirs(temp_dir, exist_ok=True)
        path = os.path.join(temp_dir, "speech.mp3")
        gTTS(text=text, lang=lang).save(path)
        return path
    except Exception as e:
        print("TTS Error:", e)
        return None
    
# ---------- Extract First Name & Email ----------
def extract_name_email(text):
    prompt = f"""
You are an intelligent assistant. Extract the **first name only** and email address from the input text.

Input: "{text}"

Return strictly in this JSON format:
{{
  "first_name": "Only First Name",
  "email": "User Email"
}}
Return "null" if not found.
"""
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        cleaned = response.text.strip().replace("```json", "").replace("```", "")
        result = json.loads(cleaned)
        return result.get("first_name"), result.get("email")
    except Exception as e:
        print("Name/Email Extraction Error:", e)
        return None, None

# ---------- Fetch App Modules & Session ID ----------
def get_user_modules_and_session(email):
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.app_module, ISNULL(MAX(l.session_id), 0) + 1 AS session
            FROM Users u
            LEFT JOIN userlog_details l ON u.email = l.email
            WHERE u.email = ?
            GROUP BY u.app_module
        """, (email,))
        row = cursor.fetchone()
        if row:
            return row.app_module, str(row.session)
    except Exception as e:
        print("DB Error (modules/session):", e)
    return "", "1"

# ---------- Main API Route ----------
@app.route('/greet', methods=['POST'])
def greet_user():
    data = request.get_json()
    input_text = data.get("text", "")

    if not input_text.strip():
        return jsonify({"error": "Empty input"}), 400

    # Step 1: Extract name and email
    first_name, email = extract_name_email(input_text)
    if not first_name or not email:
        return jsonify({"error": "Could not extract name or email"}), 400

    email = email.replace(" dot ", ".").replace(" at ", "@").replace(" underscore ", "_").replace(" ", "")
    # Step 2: Get modules and session ID
    module_str, session_id = get_user_modules_and_session(email)
    if not module_str:
        return jsonify({"error": "User not found in Users table"}), 404

    # Step 3: Classify modules to companies
    companies = classify_modules(module_str)
    if not companies:
        return jsonify({"error": "No matching modules found in support datasets"}), 404

    # Step 4: Generate summary using AI
    summary = generate_summary(first_name, companies)

    # Step 5: Generate voice greeting
    audio_path = speak_text(summary)
    if not audio_path:
        return jsonify({"error": "Text-to-speech failed"}), 500

    # Step 6: Return response
    return jsonify({
        "companies": companies,
        "session_id": session_id,
        "email": email,
        "summary": summary,
        "audio_path": "/static/Temp/speech.mp3"
    }), 200



def save_chat_to_txt(chat_history, filename='chat_session_1.txt'):
    lines = []
    for msg in chat_history:
        line = f"[{msg['time']}] {msg['role'].capitalize()}: {msg['message']}"
        lines.append(line)
    content = "\n".join(lines)

    os.makedirs("sessions", exist_ok=True)
    filepath = os.path.join("sessions", filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    return filepath

# ====== Utility: Send Email with TXT Attachment ======
def send_email_with_attachment(to_email, ticket_id, complaint, txt_file_path):
    msg = MIMEMultipart()
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = f"Salesforce Ticket Raised: {ticket_id}"

    body = f"""\
Dear Customer,

Your support ticket has been created successfully.
You can check our conversation here: {os.path.basename(txt_file_path)}

Ticket ID: {ticket_id}
Complaint: {complaint}
Status: Pending

Okay, I have raised a ticket. Our technicians will connect with you soon.

Thank you,
Salesforce Support Assistant
"""
    msg.attach(MIMEText(body, "plain"))

    with open(txt_file_path, "rb") as f:
        attachment = MIMEApplication(f.read(), _subtype="txt")
        attachment.add_header('Content-Disposition', 'attachment', filename="chat_session_1.txt")
        msg.attach(attachment)

    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login(FROM_EMAIL, EMAIL_PASSWORD)
    server.send_message(msg)
    server.quit()

# ====== Utility: Generate Gemini AI Response ======
def generate_ticket_response(chat_history):
    model = genai.GenerativeModel("gemini-1.5-flash")
    ticket_id = f"TKT-{uuid.uuid4().hex[:8].upper()}"
    last_msg = chat_history[-1]["message"]

    prompt = f"""
You are a helpful Salesforce support assistant. A user has raised a support complaint based on the following conversation:
"{last_msg}"

Please respond with a confirmation message that includes this format:
"Your ticket no {ticket_id} has been raised. Our technical person will connect with you. For better understanding, I have sent all the information to your e-mail id."
"""

    response = model.generate_content(prompt)
    return response.text.strip(), ticket_id

# ====== Utility: Generate TTS Audio (Non-blocking) ======
def generate_audio(text, lang="en"):
    try:
        sound = gTTS(text=text, lang=lang, tld='co.in')
        sound.save(TEMP_AUDIO_PATH)
    except Exception as e:
        print("gTTS Error:", e)


# ====== Flask Endpoint ======
@app.route("/raise_ticket", methods=["POST"])
def raise_ticket():
    data = request.get_json()
    chat_history = data.get("chat_history", [])
    email = data.get("email")

    if not email or not chat_history:
        return jsonify({"error": "Invalid payload"}), 400

    txt_file_path = save_chat_to_txt(chat_history)
    gemini_response, ticket_id = generate_ticket_response(chat_history)
    complaint = chat_history[-1]["message"]
    send_email_with_attachment(email, ticket_id, complaint, txt_file_path)

    # Generate TTS voice response in background
    generate_audio(gemini_response, lang="en")

    return jsonify({"response": gemini_response})

# ========== UI Routes (Optional) ==========
@app.route("/", methods=["GET"])
def index():
    return render_template("./ai-chatboat/chatbot.html")




# ========== 7. Run ==========
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=3004)