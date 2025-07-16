from flask import Flask, request, jsonify,render_template
import google.generativeai as genai
import pyodbc
from gtts import gTTS
import os, random, pandas as pd, smtplib, string
from email.mime.text import MIMEText
from difflib import get_close_matches
import json

app = Flask(__name__)
genai.configure(api_key="AIzaSyBAZymOAXFyooYK4fcE8kq-YHWh9Em-1bs")
model = genai.GenerativeModel("gemini-1.5-flash")

TEMP_FOLDER = "./static/Temp"
os.makedirs(TEMP_FOLDER, exist_ok=True)
TEMP_AUDIO =   os.path.join("static", "Temp", "speech.mp3")
session_context = {}

FROM_EMAIL = "debasishsahoo510@gmail.com"
EMAIL_PASSWORD = "ciqa ryfz zhjt ugzk"

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=122.163.121.176,3050;"
    "DATABASE=Agentic_ai_poc;"
    "UID=Developer1;"
    "PWD=Aiinhome@123"
)
cursor = conn.cursor()

def get_static_audio_uri():
    return "/static/Temp/speech.mp3"


def get_static_audio_uri():
    return "/static/Temp/speech.mp3"

def generate_audio(text):
    try:
        gTTS(text=text, lang="en", tld='co.in').save(TEMP_AUDIO)
    except Exception as e:
        print("TTS Error:", e)

def send_ticket_email(to_email, ticket_id):
    try:
        msg = MIMEText(f"Your support ticket ID is: {ticket_id}. Our team will connect within 1–2 working days.")
        msg["Subject"] = f"Support Ticket {ticket_id}"
        msg["From"] = FROM_EMAIL
        msg["To"] = to_email
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(FROM_EMAIL, EMAIL_PASSWORD)
            server.send_message(msg)
    except Exception as e:
        print("Email Error:", e)

def get_faq_df(companies):
    dfs = []
    for c in companies:
        name = c["name"].lower()
        modules = [m.lower() for m in c["modules"]]
        table = "o9_support_dataset" if name == "o9" else "salesforce_support_dataset" if name == "salesforce" else None
        if table:
            cursor.execute(f"SELECT * FROM {table}")
            df = pd.DataFrame.from_records(cursor.fetchall(), columns=[col[0] for col in cursor.description])
            df = df[df["app_module"].str.lower().isin(modules)]
            dfs.append(df)
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()

def summarize_answer(answer):
    try:
        summary = model.generate_content(f"Summarize this answer in 2-3 lines: {answer}").text.strip()
        return summary or answer
    except:
        return answer

def find_best_faq_match(user_question, faq_rows):
    faq_questions = [r["question_faq"].strip() for r in faq_rows if r.get("question_faq")]

    matches = get_close_matches(user_question.strip(), faq_questions, n=1, cutoff=0.6)
    if matches:
        match_q = matches[0]
        return next((r for r in faq_rows if r.get("question_faq") and r["question_faq"].strip() == match_q), None), f"Matched with: {match_q}"

    try:
        rephrase_prompt = f"Rephrase this user query for matching FAQ: \"{user_question}\""
        rephrased = model.generate_content(rephrase_prompt).text.strip()
        matches = get_close_matches(rephrased, faq_questions, n=1, cutoff=0.6)
        if matches:
            match_q = matches[0]
            return next((r for r in faq_rows if r.get("question_faq") and r["question_faq"].strip() == match_q), None), f"Rephrased and matched with: {match_q}"
    except Exception as e:
        print("Gemini error:", e)

    return None, "No suitable match"

import re

def extract_question_number(text, max_options=3):
    match = re.search(r"\b(?:number|no|option)?\s*(\d+)\b", text)
    if match:
        idx = int(match.group(1)) - 1
        if 0 <= idx < max_options:
            return idx
    return None


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()
    sid = data.get("id")
    q = data.get("question", "").strip().lower()
    email = data.get("email")
    companies = data.get("companies", [])

    if not sid or not email or not companies:
        return jsonify(error="Missing fields"), 400

    sess = session_context.setdefault(sid, {
        "phase": "show_options", "faq_df": None, "selected_qs": [], "email": email
    })

    if sess["faq_df"] is None:
        df = get_faq_df(companies)
        if df.empty:
            msg = "You don't have access to any module-related help content."
            generate_audio(msg)
            return jsonify(response=msg, audio_file=get_static_audio_uri())
        sess["faq_df"] = df
        questions = df["question_faq"].dropna().tolist()
        sess["selected_qs"] = random.sample(questions, min(3, len(questions)))
        options_msg = "Hello there!  I am your virtual assistant Eva from Aiinhome. Let me know how I can  help you. Do you need help with: \n"
        options_msg += '\n'.join([f"{i+1}. {q}" for i, q in enumerate(sess["selected_qs"])])
        options_msg += "\n. something else"
        generate_audio(options_msg)
        return jsonify(response=options_msg, audio_file=get_static_audio_uri())

    df = sess["faq_df"]
    faq_rows = df.to_dict("records")
    faq_list = df["question_faq"].dropna().tolist()

    if sess["phase"] == "show_options":
        if any(re.search(rf"\b{phrase}\b", q) for phrase in ["something else", "option 4", "number 4", "no 4", "4"]):
            sess["phase"] = "wait_for_custom_question"
            msg = "Please describe your question clearly so I can help you."
            generate_audio(msg)
            return jsonify(response=msg, audio_file=get_static_audio_uri())

        index = extract_question_number(q, len(sess["selected_qs"]))
        if index is not None:
            selected_q = sess["selected_qs"][index]
            # ✅ Check if selected_q is from allowed module
            if selected_q not in faq_list:
                msg = "You don't have access to this question. Please ask within your module."
                generate_audio(msg)
                return jsonify(response=msg, audio_file=get_static_audio_uri())
            q = selected_q

        match, _ = find_best_faq_match(q, faq_rows)
        if not match or match["question_faq"] not in faq_list:
            msg = "You don't have access to this question. Please ask within your module."
            generate_audio(msg)
            return jsonify(response=msg, audio_file=get_static_audio_uri())

        summary = summarize_answer(match["answer_faq"])
        sess["last_answer"] = summary
        sess["phase"] = "await_feedback"
        msg = f"{summary} Are you satisfied with this answer? (yes/no)"
        generate_audio(msg)
        return jsonify(response=msg, audio_file=get_static_audio_uri())

    elif sess["phase"] == "wait_for_custom_question":
        index = extract_question_number(q, len(sess["selected_qs"]))
        if index is not None:
            selected_q = sess["selected_qs"][index]
            if selected_q not in faq_list:
                msg = "You don't have access to this question. Please ask within your module."
                generate_audio(msg)
                return jsonify(response=msg, audio_file=get_static_audio_uri())
            q = selected_q

        match, _ = find_best_faq_match(q, faq_rows)
        if not match or match["question_faq"] not in faq_list:
            msg = "Sorry, you don't have access to this question. Please ask another question from your modules."
            generate_audio(msg)
            return jsonify(response=msg, audio_file=get_static_audio_uri())

        summary = summarize_answer(match["answer_faq"])
        sess["last_answer"] = summary
        sess["phase"] = "await_feedback"
        msg = f"{summary} Are you satisfied with this answer? (yes/no)"
        generate_audio(msg)
        return jsonify(response=msg, audio_file=get_static_audio_uri())

    elif sess["phase"] == "await_feedback":
        if "yes" in q:
            sess["phase"] = "show_options"
            msg = "Okay, thank you. Would you like to ask another question?"
        elif "no" in q:
            sess["phase"] = "await_ticket_confirmation"
            msg = "Would you like to raise a ticket to connect with our technical team?"
        else:
            msg = "Please reply with yes or no to understand that we are able to solve your previous problems."
        generate_audio(msg)
        return jsonify(response=msg, audio_file=get_static_audio_uri())

    elif sess["phase"] == "await_ticket_confirmation":
        if "yes" in q or "ticket" in q:
            ticket_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            send_ticket_email(sess["email"], ticket_id)
            sess["phase"] = "show_options"
            msg = f"our technical suport will connect with you soon.Your ticket ID is {ticket_id}. Would you like to ask another question"
        else:
            sess["phase"] = "await_more_or_escalate"
            msg = "Would you like to ask another question on your modules or connect to our customer support?"
        generate_audio(msg)
        return jsonify(response=msg, audio_file=get_static_audio_uri())

    elif sess["phase"] == "await_more_or_escalate":
        if "ask" in q or "question" in q:
            sess["phase"] = "show_options"
            return ask()
        elif any(keyword in q for keyword in ["connect", "authority", "speak", "talk", "support", "customer service","customer support", "human","ok lets go"]):
            authority_number = f"+91-{random.randint(1000,9999)}-{random.randint(100000,999999)}"
            msg = f"keep mobiles close to You.our customer support team will connect in 10 minutes at {authority_number} number"
            sess["phase"] = "show_options"

        else:
            msg = "Please specify if you want to ask more questions or connect to authority."
        generate_audio(msg)
        return jsonify(response=msg, audio_file=get_static_audio_uri())

    msg = "Let's continue. Ask your next question."
    generate_audio(msg)
    return jsonify(response=msg, audio_file=get_static_audio_uri())



@app.route("/reset_session", methods=["POST"])
def reset_session():
    sid = request.args.get("id")
    if sid in session_context:
        del session_context[sid]
        return jsonify(message=f"Session {sid} has been reset.")
    return jsonify(message="Session ID not found."), 404


#################################################################################################
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

@app.route('/greet', methods=['POST'])
def greet_user():
    data = request.get_json()
    input_text = data.get("text", "")

    if not input_text.strip():
        return jsonify({"error": "Empty input"}), 400

    # Step 1: Extract name and email
    first_name, email = extract_name_email(input_text)
    print(f"Extract data: First Name: {first_name}, Email: {email}")

    if not first_name or not email:
        return jsonify({"error": "Could not extract name or email"}), 400
    
    email = email.replace(" dot ", ".").replace(" ", "")
    
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


# ========== UI Routes (Optional) ==========
@app.route("/", methods=["GET"])
def index():
    return render_template("./chatbot.html")
    # return render_template("./ai-chatboat/index.html")

# @app.route("/chatbot")
# def chatbot():
#     return render_template("./chatbot.html")


# ========== 7. Run ==========
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=3004)