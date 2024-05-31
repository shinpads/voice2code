// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const recorder = require('node-record-lpcm16');
const { Configuration, OpenAIApi } = require('openai');
const fs = require('fs');
const path = require('path');
const request = require('request')

function parseResult (err, resp, body) {
	if (err) console.error(err)
	console.log(body)
  }



async function recordAudio(filePath) {
    return new Promise((resolve, reject) => {
        console.log('Starting audio recording...');
        const recording = recorder.record({
            sampleRateHertz: 16000,
            recordProgram: 'sox -d'
        });

        const fileStream = fs.createWriteStream(filePath, { encoding: 'binary' });

        recording.stream().pipe(fileStream);

        setTimeout(() => {
            console.log('Stopping audio recording...');
            recording.stop();
            resolve(filePath);
        }, 3000); // Record for 3 seconds
    });
}

async function sendToWit(audioFilePath) {
    const witToken = "YOUR_WIT_AI_TOKEN";
    const audioFile = fs.createReadStream(audioFilePath);

    return new Promise((resolve, reject) => {
        const requestOptions = {
            url: 'https://api.wit.ai/speech?client=chromium&lang=en-us&output=json',
            headers: {
                'Accept': 'application/vnd.wit.20160202+json',
                'Authorization': `Bearer ${witToken}`,
                'Content-Type': 'audio/wav'
            }
        };

        console.log('Sending audio data to Wit.ai...');
        const req = request.post(requestOptions, (err, resp, body) => {
            if (err) {
                console.error('Error in request:', err);
                reject(err);
                return;
            }
            console.log('Received response from Wit.ai:', body);
            resolve(body);
        });

        audioFile.pipe(req);
    });
}


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "voice2code" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('voice2code.helloWorld', async () => {
		// The code you place here will be executed every time your command is executed

		// get file content
		getFileContent()

		const audioFilePath = path.join(context.extensionPath, 'audio.wav');

		try {
			
            console.log('Starting audio recording process...');
            await recordAudio(audioFilePath);
			console.log(audioFilePath)

            // console.log('Starting transcription process...');
            // const result = await sendToWit(audioFilePath);

            // console.log('Transcription result:', result);
            // vscode.window.showInformationMessage('Transcription:', result);
        } catch (error) {
            console.error('Error during transcription:', error);
            vscode.window.showErrorMessage('Error during transcription:', error.message);
        }

		// const audioFilePath = path.join(context.extensionPath, 'audio.wav');
        // vscode.window.showInformationMessage('Recording audio for 5 seconds...');
        // await recordAudio(audioFilePath);

		// start recording
		// const panel = vscode.window.createWebviewPanel(
        //     'recordAudio',
        //     'Record Audio',
        //     vscode.ViewColumn.One,
        //     {
        //         enableScripts: true
        //     }
        // );

		// panel.webview.html = getWebviewContent();

        // panel.webview.onDidReceiveMessage(
        //     message => {
        //         switch (message.command) {
        //             case 'audioData':
        //                 processAudioData(message.data);
        //                 return;
        //         }
        //     },
        //     undefined,
        //     context.subscriptions
        // );

		// context.subscriptions.push(disposable);

		// // Display a message box to the user
		// vscode.window.showInformationMessage('Hello World from voice2code!');
	});

	context.subscriptions.push(disposable);
}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Record Audio</title>
</head>
<body>
    <h1>Record Audio</h1>
    <button id="recordButton">Record</button>
    <button id="stopButton" disabled>Stop</button>
    <script>
        const vscode = acquireVsCodeApi();

        let mediaRecorder;
        let audioChunks = [];

        document.getElementById('recordButton').onclick = () => {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    mediaRecorder = new MediaRecorder(stream);
                    mediaRecorder.start();

                    mediaRecorder.ondataavailable = event => {
                        audioChunks.push(event.data);
                    };

                    mediaRecorder.onstop = () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                        audioChunks = [];
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const base64String = reader.result.replace('data:audio/wav;base64,', '');
                            vscode.postMessage({
                                command: 'audioData',
                                data: base64String
                            });
                        };
                        reader.readAsDataURL(audioBlob);
                    };

                    document.getElementById('recordButton').disabled = true;
                    document.getElementById('stopButton').disabled = false;
                });
        };

        document.getElementById('stopButton').onclick = () => {
            mediaRecorder.stop();
            document.getElementById('recordButton').disabled = false;
            document.getElementById('stopButton').disabled = true;
        };
    </script>
</body>
</html>`;
}


function getFileContent() {
	const editor = vscode.window.activeTextEditor;
	
	if (!!!editor) {
	  vscode.window.showInformationMessage('No active text editor found.');
	  return;
	}
	
	const documentText = editor.document.getText();
	vscode.window.showInformationMessage('Code in the current file:', documentText);
	console.log('Code in the current file:', documentText);
  }

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
