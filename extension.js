// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const recorder = require("node-record-lpcm16");
const fs = require("fs");
const path = require("path");
const request = require("request");
const { transcribeAudio, createChatCompletion } = require("./openai.js");

async function recordAudio(filePath) {
  return new Promise((resolve, reject) => {
    console.log("Starting audio recording...");
    const recording = recorder.record({
      sampleRateHertz: 16000,
      recordProgram: "sox -d",
    });

    const fileStream = fs.createWriteStream(filePath, { encoding: "binary" });

    recording.stream().pipe(fileStream);

    setTimeout(() => {
      console.log("Stopping audio recording...");
      recording.stop();
      resolve(filePath);
    }, 3000); // Record for 3 seconds
  });
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Congratulations, your extension "voice2code" is now active!');

  let disposable = vscode.commands.registerCommand(
    "voice2code.helloWorld",
    async () => {
      // get file content
      await performAction("increase the h1 font size");
      getFileContent();

      const audioFilePath = path.join(context.extensionPath, "audio.wav");

      try {
        console.log("Starting audio recording process...");
        await recordAudio(audioFilePath);
        console.log(audioFilePath);

        console.log("Starting transcription process...");
        const dir = __dirname + "/audio.wav";
        const transcribed = await transcribeAudio(dir);
        console.log("transcribed:", transcribed.text);
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

async function performAction(action) {
  const editor = vscode.window.activeTextEditor;
  const text = editor.document.getText();
  const prompt = `
    Here is some code:\n
    ${text}

    Here is the action you requested: ${action}\n

    Please update the code accordingly. Return a json object with two keys. the first key is "oldContent" and the second key is "newContent". Only return the lines of the code that you changed plus the context around it. For example, the current block.
    Return nothing else.
  `;

  const response = await createChatCompletion(prompt, true);
  const parsedJson = JSON.parse(response);
  console.log(parsedJson);
  return parsedJson;
}

function editFile(fileName, oldContent, newContent) {
  const openEditors = vscode.window.visibleTextEditors;
  const editor = openEditors.find((editor) =>
    editor.document.fileName.includes(fileName)
  );
  editor.edit((editBuilder) => {
    const document = editor.document;

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

    console.log(match, startIndex);
    const range = new vscode.Range(
      document.positionAt(startIndex),
      document.positionAt(startIndex + match.length)
    );

    editBuilder.replace(range, newContent);
  });
}

function getFileContent() {
  const editor = vscode.window.activeTextEditor;

  if (!!!editor) {
    vscode.window.showInformationMessage("No active text editor found.");
    return;
  }

  const documentText = editor.document.getText();
  vscode.window.showInformationMessage(
    "Code in the current file:",
    documentText
  );
  console.log("Code in the current file:", documentText);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
