import subprocess
import sys
import tempfile
import os

class SandboxService:
    def execute(self, code: str) -> str:
        """
        Safely executes Python code and returns the output.
        """

        cleaned_code = code.strip()
        if not cleaned_code:
            return "Error: No code provided."
        
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(cleaned_code)
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