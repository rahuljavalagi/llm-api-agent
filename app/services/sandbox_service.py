import subprocess
import shlex
import json

class SandboxService:
    def execute(self, code: str) -> str:
        """
        Safely executes a cURL command and returns the output.
        """

        cleaned_code = code.strip()
        if not cleaned_code.startswith("curl"):
            return json.dumps({
                "error": "This sandbox only executes cURL commands."
            })
        
        try:
            args = shlex.split(cleaned_code)

            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                return result.stdout
            else:
                return f"Execution Error:\n{result.stderr}"
            
        except subprocess.TimeoutExpired:
            return "Error: Timed Out (Took longer than 10s)."
        except Exception as e:
            return f"Error: {str(e)}"