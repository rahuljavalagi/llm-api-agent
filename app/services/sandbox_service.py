import subprocess
import sys
import tempfile
import os
import requests

class SandboxService:
    def __init__(self):
        self.execution_mode = os.getenv("SANDBOX_EXECUTION_MODE", "local").strip().lower()
        self.sandbox_api_url = os.getenv("SANDBOX_API_URL", "").strip()
        self.sandbox_api_key = os.getenv("SANDBOX_API_KEY", "").strip()

        timeout_raw = os.getenv("SANDBOX_API_TIMEOUT_SECONDS", "35")
        try:
            self.sandbox_api_timeout_seconds = max(1.0, float(timeout_raw))
        except ValueError:
            self.sandbox_api_timeout_seconds = 35.0

    def execute(self, code: str) -> str:
        """
        Executes Python code and returns output.
        Supports local execution or forwarding to a remote sandbox service.
        """

        cleaned_code = code.strip()
        if not cleaned_code:
            return "Error: No code provided."

        if self.execution_mode == "remote":
            return self._execute_remote(cleaned_code)

        return self._execute_local(cleaned_code)

    def _execute_remote(self, code: str) -> str:
        if not self.sandbox_api_url:
            return "Error: SANDBOX_API_URL is not configured for remote sandbox mode."

        headers = {"Content-Type": "application/json"}
        if self.sandbox_api_key:
            headers["X-Sandbox-Key"] = self.sandbox_api_key

        try:
            response = requests.post(
                self.sandbox_api_url,
                json={"code": code},
                headers=headers,
                timeout=self.sandbox_api_timeout_seconds,
            )

            if response.status_code >= 400:
                detail = f"Sandbox service returned HTTP {response.status_code}."
                try:
                    payload = response.json()
                    if isinstance(payload, dict) and isinstance(payload.get("detail"), str):
                        detail = payload["detail"]
                except ValueError:
                    pass
                return f"Error: {detail}"

            try:
                payload = response.json()
            except ValueError:
                return "Error: Sandbox service returned non-JSON response."

            if not isinstance(payload, dict):
                return "Error: Sandbox service returned an invalid payload."

            output = payload.get("output")
            if isinstance(output, str):
                return output if output.strip() else "Code executed successfully (no output)."

            return "Error: Sandbox service response is missing an output field."

        except requests.Timeout:
            return f"Error: Sandbox timed out after {int(self.sandbox_api_timeout_seconds)}s."
        except requests.RequestException as exc:
            return f"Error: Could not reach sandbox service. {str(exc)}"

    def _execute_local(self, code: str) -> str:
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(code)
                temp_file = f.name

            try:
                result = subprocess.run(
                    [sys.executable, temp_file],
                    capture_output=True,
                    text=True,
                    timeout=30
                )

                output = result.stdout
                if result.stderr:
                    output += f"\nErrors:\n{result.stderr}"

                return output if output.strip() else "Code executed successfully (no output)."

            finally:
                os.unlink(temp_file)

        except subprocess.TimeoutExpired:
            return "Error: Timed Out (Took longer than 30s)."
        except Exception as e:
            return f"Error: {str(e)}"