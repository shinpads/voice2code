const vscode = require("vscode");
const recorder = require("node-record-lpcm16");
const fs = require("fs");
const path = require("path");
const {
  transcribeAudio,
  createChatCompletion,
  createAudioStreamFromText,
  streamAudio,
} = require("./openai.js");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Congratulations, your extension "voice2code" is now active!');

  let disposable = vscode.commands.registerCommand(
    "voice2code.voice2code",
    async () => {
      try {
        const progressNotification = vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Listening...",
            cancellable: true,
          },
          async (progress, token) => {
            const timestamp = Date.now();
            const audioFileName = `audio-${timestamp}.wav`;
            const audioFilePath = path.join(
              context.extensionPath,
              audioFileName
            );
            const activeEditor = vscode.window.activeTextEditor;
            const selection = activeEditor.selection;
            const selectionText = activeEditor.document.getText(selection);
            const recordingResult = await recordAudio(audioFilePath);
            const startTime = new Date();
            console.log(recordingResult);
            console.log("Starting transcription process...");
            const dir = __dirname + `/${audioFileName}`; // Adjust if necessary

            const transcribed = await transcribeAudio(dir);
            progress.report({ message: "Performing Action..." });
            console.log("time since start", new Date() - startTime);
            console.log("Transcription:", transcribed);
            await performAction(transcribed, selectionText);
            console.log("time since start", new Date() - startTime);
            progressNotification.cancel();
          }
        );
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
  const openEditors = vscode.window.visibleTextEditors;
  const code = openEditors.map((editor) => ({
    code: editor.document.getText(),
    fileName: editor.document.fileName,
  }));

  const prompt = `
    Here is my code code:\n
    ${code
      .map((c) => `File Name: ${c.fileName}\nCode:\`\`\`${c.code}\`\`\``)
      .join("\n\n")}

    Here is the action you requested: ${action}\n
    ${
      selectionText.length > 1
        ? "Here is the selected text I am referring to: " + selectionText
        : ""
    }
    Please return a JSON list of changes to be made to the code. The changes should be in the format of:
    {
	    one_sentence_summary,
      changes: [
      {
        filename,
        oldContent,
        newContent,
      }
      ... other changes
    ]}

    oldContent should be the code you are replacing. If you are adding new code, set oldContent to null. Old code should only include the lines you are chaning plus the context around it. For example the current block.
	  one_sentence_summary should be a very short description of what you changed. it should be in past tense and first-person. for example, "I added a new style."
  `;

  const response = await createChatCompletion(prompt, true);
  const parsedJson = JSON.parse(response);

  parsedJson.changes.forEach((change) => {
    const { oldContent, newContent, filename } = change;
    editFile(filename, oldContent, newContent);
  });

  summarizeChanges(parsedJson.one_sentence_summary);
}

const { exec } = require("child_process");
async function summarizeChanges(one_sentence_summary) {
  const audioStream = await createAudioStreamFromText(one_sentence_summary);
  streamAudio(audioStream);
  // exec(`say "${one_sentence_summary}"`, (error, stdout, stderr) => {
  //   if (error) {
  //     console.error(`exec error: ${error}`);
  //     return;
  //   }
  //   if (stderr) {
  //     console.error(`stderr: ${stderr}`);
  //     return;
  //   }
  //   console.log(`stdout: ${stdout}`);
  // });
}

function editFile(fileName, oldContent, newContent) {
  console.log(fileName, oldContent, newContent);
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
