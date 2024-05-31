// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const recorder = require("node-record-lpcm16");
const fs = require("fs");
const path = require("path");
const request = require("request");
const { transcribeAudio, createChatCompletion } = require("./openai.js");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Congratulations, your extension "voice2code" is now active!');

  let disposable = vscode.commands.registerCommand(
    "voice2code.voice2code",
    async () => {
      try {
        const timestamp = Date.now();
        const audioFileName = `audio-${timestamp}.wav`;
        const audioFilePath = path.join(context.extensionPath, audioFileName);
        const recordingResult = await recordAudio(audioFilePath);
        const startTime = new Date();
        console.log(recordingResult);
        console.log("Starting transcription process...");
        const dir = __dirname + `/${audioFileName}`; // Adjust if necessary
        const activeEditor = vscode.window.activeTextEditor;
        const selection = activeEditor.selection;
        const selectionText = activeEditor.document.getText(selection);

        const transcribed = await transcribeAudio(dir);
        console.log("time since start", new Date() - startTime);
        console.log("Transcription:", transcribed);
        await performAction(transcribed, selectionText);
        console.log("time since start", new Date() - startTime);
      } catch (error) {
        console.error("Error during transcription:", error);
        vscode.window.showErrorMessage(
          "Error during transcription:",
          error.message
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

async function performAction(action, selectionText) {
  // const editor = vscode.window.activeTextEditor;
  const openEditors = vscode.window.visibleTextEditors;
  const editor = openEditors.find((editor) =>
    editor.document.fileName.includes("index.css")
  );

  const text = editor.document.getText();
  const prompt = `
    Here is some code:\n
    ${text}

    Here is the action you requested: ${action}\n
    ${
      selectionText.length > 1
        ? "Here is the selected text I am referring to: " + selectionText
        : ""
    }
    Please update the code accordingly. Return a json object with two keys. the first key is "oldContent" and the second key is "newContent". Only return the lines of the code that you changed plus the context around it. For example, the current block.
    If you are adding brand new code, set oldContent to null.
    Return nothing else.
  `;

  const response = await createChatCompletion(prompt, true);
  const parsedJson = JSON.parse(response);

  const { oldContent, newContent } = parsedJson;
  editFile(editor.document.fileName, oldContent, newContent);
}

function editFile(fileName, oldContent, newContent) {
  console.log(oldContent, newContent);
  const openEditors = vscode.window.visibleTextEditors;
  const editor = openEditors.find((editor) =>
    editor.document.fileName.includes(fileName)
  );
  editor.edit((editBuilder) => {
    const document = editor.document;
    if (oldContent) {
      const escapedFind = oldContent.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"); // Escape special characters in the find text
      const looseWhitespaceFind = escapedFind.replace(/\s+/g, "\\s*"); // Allow loose whitespace

      const regex = new RegExp(looseWhitespaceFind, "g");
      const matches = document.getText().match(regex);

      if (!matches || !matches.length) {
        vscode.window.showInformationMessage("No matches found.");
        return;
      }

      const match = matches[0];
      const startIndex = document.getText().indexOf(match);

      const range = new vscode.Range(
        document.positionAt(startIndex),
        document.positionAt(startIndex + match.length)
      );

      editBuilder.replace(range, newContent);
    } else {
      // add to bottom of file
      const lastLine = document.lineAt(document.lineCount - 1);
      const end = lastLine.range.end;
      editBuilder.insert(end, newContent);
    }
  });
}

// Function to determine if a buffer chunk is silent
function isSilent(buffer, threshold = 0.0117285156) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 2) {
    sum += Math.abs(buffer.readInt16LE(i));
  }
  let average = sum / (buffer.length / 2);
  console.log(average < threshold * 32768);
  console.log(`Average amplitude: ${average}, Threshold: ${threshold * 32768}`);
  return average < threshold * 32768;
}

// Record audio and process chunks manually
async function recordAudio(filePath) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(filePath, { encoding: "binary" });

    console.log("Starting audio recording...");
    const recording = recorder
      .record({
        sampleRateHertz: 16000,
        recordProgram: "sox -d",
      })
      .stream();

    // Handle stream data directly through a writable stream
    recording.pipe(fileStream);

    let continueFlag = true;
    let silenceStartTime = null; // Reset silence start time

    recording.on("data", (chunk) => {
      if (!continueFlag) {
        console.log("700ms second of silence detected, stopping recording...");
        fileStream.end(); // Ensure to close the file stream
        // recording.stop();  // Stop the recording
        resolve();
      }

      console.log(`chunk size ${chunk.length}`);
      if (!isSilent(chunk)) {
        console.log("talking");
        silenceStartTime = null; // Reset silence start time
      } else {
        if (!silenceStartTime) {
          silenceStartTime = new Date(); // Mark the start of silence
        } else if (new Date() - silenceStartTime >= 500 && recording) {
          // Check if silence lasted 1 second
          console.log("setting flag to false");
          continueFlag = false;
        }
      }
    });
    recording.on("end", () => {
      console.log("Recording ended.");
      resolve("Recording successfully ended."); // Resolve the promise here
    });
  });
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
