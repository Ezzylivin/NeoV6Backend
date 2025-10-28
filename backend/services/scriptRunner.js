// File: backend/services/scriptRunner.js
import { spawn } from 'child_process';
import path from 'path';

/**
 * A reusable helper to run any Python script and return its JSON output.
 * @param {string} scriptName - The name of the script (e.g., 'down_data.py')
 * @param {string[]} args - An array of command-line arguments.
 * @returns {Promise<object>} A promise that resolves with the parsed JSON output.
 */
export const runPythonScript = (scriptName, args) => {
    // Get the absolute path to the script in the 'python_scripts' folder
    // Assumes you run `node app.js` from the project root
    const scriptPath = path.resolve(process.cwd(), 'python_scripts', scriptName);
    const allArgs = [scriptPath, ...args.map(String)]; // Ensure all args are strings

    console.log(`[ScriptRunner] Spawning: python3 ${scriptName} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python3', allArgs); // Use 'python' or 'python3'

        let scriptOutput = "";
        let scriptError = "";

        pythonProcess.stdout.on('data', (data) => { scriptOutput += data.toString(); });
        pythonProcess.stderr.on('data', (data) => {
            const message = data.toString();
            console.error(`[Python_stderr] ${message}`); // Log all stderr
            scriptError += message;
        });
        pythonProcess.on('close', (code) => {
            if (code === 0) { // Success
                try {
                    const result = JSON.parse(scriptOutput); // Expect JSON output
                    console.log(`[ScriptRunner] ${scriptName} finished successfully.`);
                    resolve(result);
                } catch (e) {
                    console.error(`[ScriptRunner] Failed to parse JSON from ${scriptName}:`, scriptOutput);
                    reject(new Error(`Failed to parse Python output for ${scriptName}: ${e.message}`));
                }
            } else { // Failure
                console.error(`[ScriptRunner] ${scriptName} exited with code ${code}.`);
                try { // Try parsing JSON error first
                    const errorJson = JSON.parse(scriptError);
                    reject(new Error(errorJson.message || `Python script ${scriptName} failed.`));
                } catch(e) { // Fallback to raw error string
                    reject(new Error(scriptError || `Python script ${scriptName} failed with no error message.`));
                }
            }
        });
        pythonProcess.on('error', (err) => {
            console.error(`[ScriptRunner] Failed to start script ${scriptName}:`, err);
            reject(new Error(`Failed to start Python script ${scriptName}: ${err.message}`));
        });
    });
};
