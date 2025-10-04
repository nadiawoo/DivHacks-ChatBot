import speech_recognition as sr
import google.generativeai as genai
from gtts import gTTS # For simple TTS
import os
import pygame # To play audio

# --- Configuration (replace with your actual keys/settings) ---
# For Gemini
genai.configure(api_key="AIzaSyDEMQt3ibTLWS5haZhyutDxuTUWyQ5yMeM")
model = genai.GenerativeModel('gemini-2.5-flash-lite')
chat = model.start_chat(history=[]) # Start a chat session

# For Speech Recognition
r = sr.Recognizer()

# --- Functions ---

def listen_from_mic():
    with sr.Microphone() as source:
        print("Say something!")
        r.adjust_for_ambient_noise(source) # Optional: adjust for noise
        audio = r.listen(source)
    try:
        text = r.recognize_google(audio) # Using Google's free STT
        print(f"You said: {text}")
        return text
    except sr.UnknownValueError:
        print("Could not understand audio")
        return ""
    except sr.RequestError as e:
        print(f"Could not request results from Google Speech Recognition service; {e}")
        return ""

def get_gemini_response(prompt_text):
    try:
        response = chat.send_message(prompt_text)
        return response.text
    except Exception as e:
        print(f"Gemini error: {e}")
        return "I'm sorry, I couldn't process that right now."

def speak_text(text):
    tts = gTTS(text=text, lang='en', slow=False)
    tts.save("response.mp3")
    pygame.mixer.init()
    pygame.mixer.music.load("response.mp3")
    pygame.mixer.music.play()
    while pygame.mixer.music.get_busy():
        pygame.time.Clock().tick(10)
    pygame.mixer.quit()
    os.remove("response.mp3") # Clean up

# --- Main Conversation Loop ---
print("Starting audio conversation with Gemini. Say 'quit' to end.")
while True:
    user_input_text = listen_from_mic()

    if user_input_text.lower() == "quit":
        print("Goodbye!")
        speak_text("Goodbye!")
        break
    elif user_input_text: # Only proceed if input was understood
        gemini_response_text = get_gemini_response(user_input_text)
        print(f"Gemini says: {gemini_response_text}")
        speak_text(gemini_response_text)
