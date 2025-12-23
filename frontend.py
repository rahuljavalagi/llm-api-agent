import streamlit as st
import requests
import json

st.set_page_config(page_title="LLM Powered API Agent")
st.title("LLM Powered API Agent")

st.subheader("1. Upload Documentation")
uploaded_file = st.file_uploader("Choose a PDF file", type="pdf")

if uploaded_file is not None:
    if st.button("Ingest PDF"):
        with st.spinner("Processing..."):
            files = {"file": (uploaded_file.name, uploaded_file.getvalue(), "application/pdf")}
            requests.post("http://127.0.0.1:8000/ingest", files=files)
            st.success("File processed!")

st.markdown("---")

st.subheader("2. Ask Question")
question = st.text_input("Enter your request:")

if "api_data" not in st.session_state:
    st.session_state.api_data = None

if st.button("Generate Code"):
    if question:
        with st.spinner("Thinking..."):
            res = requests.post("http://127.0.0.1:8000/query", json={"question": question})
            if res.status_code == 200:
                st.session_state.api_data = res.json()
            else:
                st.error("Error connecting to server")

if st.session_state.api_data:
    data = st.session_state.api_data
    
    st.info(data['explanation'])
    
    st.subheader("Generated Code")
    st.code(data['generated_code'], language="python")
    
    if st.button("Execute Code"):
        st.subheader("Result")
        
        if data['execution_result']:
            try:
                st.json(json.loads(data['execution_result']))
            except:
                st.text(data['execution_result'])
        else:
            st.warning("No data returned.")