import os
import json
import google.generativeai as genai
from app.models import QueryResponse

class LLMService:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is missing. Add it in .env file.")
        
        genai.configure(api_key=api_key)

        self.model = genai.GenerativeModel('gemini-3-flash-preview')

    def generate_response(self, question: str, context_chunks: list[str]) -> QueryResponse:
        """
        Takes User's question, takes PDF, sends both to Gemini with strict instructions.
        """

        context_text = "\n\n".join(context_chunks)

        prompt = f"""
        You are an expert API Developer Assistant.
        A user is asking a question about an API. Use the provided DOCUMENTATION to answer.

        DOCUMENTATION:
        {context_chunks}

        USER QUESTION:
        {question}

        INSTRUCTIONS:
        1. Explain the answer clearly in natural language.
        2. Provide a working cURL command to solve the problem.
        3. You MUST return the response in STRICT JSON format with these exact keys:
            - "explanation": (string)
            - "generated_code": (string) - The cURL command only.

        IMPORTANT: Do not wrap the output in markdown (like '''json). Just return raw JSON.
        """

        response = self.model.generate_content(prompt)

        cleaned_text = response.text.replace("'''json", "").replace("'''", "").strip()

        try:
            data = json.loads(cleaned_text)

            return QueryResponse(
                explanation=data.get("explanation", "No explanation provided."),
                generated_code=data.get("generated_code", ""),
                execution_result=None
            )
        
        except json.JSONDecodeError:
            return QueryResponse(
                explanation="Error: The AI failed to generate valid structured response.",
                generated_code="",
                execution_result=None
            )