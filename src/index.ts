import * as uuid from "uuid";
import * as AWS from "aws-sdk";
import * as Alexa from "ask-sdk";

import { Commands } from "./command";
import { Messages } from "./message";
import { isIntent } from "./isIntent";
import { escapeXmlCharacters } from "ask-sdk";

const TABLENAME = "highScores";

const DICE_ROLLS = ["1", "2", "3", "4", "5", "6"];

// Get dynamoDB instance
const dynamoDB = new AWS.DynamoDB.DocumentClient();

function rollDice(handlerInput) {
  const sessionAttributes =
    handlerInput.attributesManager.getSessionAttributes() || {};

  let currScore = sessionAttributes.hasOwnProperty("score")
    ? sessionAttributes.score
    : 0;

  var sNumber = DICE_ROLLS[Math.floor(Math.random() * DICE_ROLLS.length)];
  if (sNumber == "1") {
    currScore = 0;
  } else {
    currScore = currScore + parseInt(sNumber);
  }

  sessionAttributes.score = currScore;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  var sOutput =
    "You rolled:" +
    "  " +
    sNumber +
    "\nYour score is:" +
    " " +
    currScore +
    "\n .";

  return { sOutput, prompt: Messages.CONTINUE_OR_STOP_GAME_MESSAGE };
}

function saveScore(params) {
  dynamoDB.put(params, function (err, data) {
    if (err) {
      console.log("Failed to add score.", err);
      throw Error(err.message);
    } else {
      console.log("Successfully added score.", data);
      return data;
    }
  });
}

function getScoreReport() {
  const maxScoreReport = 10;
  const params = {
    TableName: TABLENAME,
  };

  const scanResults = [];
  let dialogue = "";
  dynamoDB.scan(params, function (err, data) {
    if (err) {
      console.log("Failed to get scores", err);
      throw Error(err.message);
    } else {
      console.log("Successfully read scores.", data);
      data.Items.forEach(function (score, index, array) {
        scanResults.push(score);
        console.log("printing", score.playerName + " (" + score.score + ")");
      });
      console.log("scanResults:", scanResults);
      if (scanResults.length < 1) {
        return dialogue;
      }
      let sortedScores = scanResults.sort((p1, p2) =>
        p1.score < p2.score ? 1 : p1.score > p2.score ? -1 : 0
      );
      console.log("sortedScores:", sortedScores);
      let scoreReports =
        sortedScores.length > maxScoreReport
          ? sortedScores.slice(0, maxScoreReport)
          : sortedScores;
      console.log("scoreReports:", scoreReports);
      let message = "";
      scoreReports.forEach(function (item, index, array) {
        message =
          message +
          (index + 1).toString() +
          ") " +
          item.playerName +
          " : " +
          item.score +
          ".\n";
      });

      dialogue =
        "Reporting top " + scoreReports.length.toString() + ":\n" + message;
      console.log("dialogue:", dialogue);
      return dialogue;
    }
  });
}

/**
 * List of all Intents
 */
const WelcomeIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(Messages.WELCOME_MESSAGE + Messages.GAME_START_MESSAGE)
      .reprompt(Messages.GAME_START_MESSAGE)
      .getResponse();
  },
};

const StartGameIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      isIntent("StartGameIntent")(handlerInput)
    );
  },
  handle(handlerInput) {
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes() || {};
    let currScore = 0;
    let isPlaying = true;
    let saveScore = false;
    let playerName = null;
    sessionAttributes.score = currScore;
    sessionAttributes.isPlaying = isPlaying;
    sessionAttributes.saveScore = saveScore;
    sessionAttributes.playerName = playerName;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    let res = rollDice(handlerInput);
    return handlerInput.responseBuilder
      .speak(res.sOutput + res.prompt)
      .reprompt(res.prompt)
      .getResponse();
  },
};

const RollDiceIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      isIntent("RollDiceIntent")(handlerInput)
    );
  },
  handle(handlerInput) {
    let response =
      handlerInput.requestEnvelope.request.intent.slots.gameState.value;
    if (response.toLowerCase() === Commands.CONTINUE) {
      let res = rollDice(handlerInput);
      return handlerInput.responseBuilder
        .speak(res.sOutput + res.prompt)
        .reprompt(res.prompt)
        .getResponse();
    } else if (response.toLowerCase() === Commands.STOP) {
      const sessionAttributes =
        handlerInput.attributesManager.getSessionAttributes() || {};

      sessionAttributes.isPlaying = false;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      return handlerInput.responseBuilder
        .speak(Messages.SAVE_SCORE_MESSAGE)
        .reprompt(Messages.SAVE_SCORE_MESSAGE)
        .getResponse();
    } else {
      return ErrorHandler.call(handlerInput);
    }
  },
};

const GetPlayerNameOrExitIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      isIntent("GetPlayerNameOrExitIntent")(handlerInput)
    );
  },
  handle(handlerInput) {
    let response =
      handlerInput.requestEnvelope.request.intent.slots.answer.value || "";
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes() || {};
    if (response.toLowerCase() === Commands.NO) {
      let scoreDialogue = getScoreReport();
      console.log("scoreDialogues:", scoreDialogue);
      return handlerInput.responseBuilder
        .speak(scoreDialogue + Messages.REPLAY_OR_END_GAME_MESSAGE)
        .reprompt(Messages.REPLAY_OR_END_GAME_MESSAGE)
        .getResponse();
    } else if (response.toLowerCase() === Commands.YES) {
      sessionAttributes.saveScore = true;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return handlerInput.responseBuilder
        .speak(Messages.GET_PLAYER_NAME_MESSAGE)
        .reprompt(Messages.GET_PLAYER_NAME_MESSAGE)
        .getResponse();
    } else {
      return ErrorHandler.call(handlerInput);
    }
  },
};

const SaveHighScoreIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      isIntent("SaveHighScoreIntent")(handlerInput)
    );
  },
  handle(handlerInput) {
    var playerName =
      handlerInput.requestEnvelope.request.intent.slots.Name.value;
    const sessionAttributes =
      handlerInput.attributesManager.getSessionAttributes() || {};
    sessionAttributes.playerName = playerName;
    let dynamoDBWriteParams = {
      TableName: TABLENAME,
      Item: {
        id: uuid.v4(),
        playerName: sessionAttributes.playerName,
        score: sessionAttributes.score,
      },
    };

    let res = saveScore(dynamoDBWriteParams);
    let scoreDialogue = getScoreReport();
    console.log("scoreDialogues:", scoreDialogue);
    return handlerInput.responseBuilder
      .speak(scoreDialogue + Messages.REPLAY_OR_END_GAME_MESSAGE)
      .reprompt(Messages.REPLAY_OR_END_GAME_MESSAGE)
      .getResponse();
  },
};

const ReplayOrEndGameIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      isIntent("ReplayOrEndGameIntent")(handlerInput)
    );
  },
  handle(handlerInput) {
    let response =
      handlerInput.requestEnvelope.request.intent.slots.state.value;
    if (response.toLowerCase() === Commands.REPLAY) {
      return StartGameIntentHandler.handle(handlerInput);
    } else if (response.toLowerCase() === Commands.END_GAME) {
      return StopIntentHandler.handle(handlerInput);
    } else {
      let scoreDialogue = getScoreReport();
      console.log("scoreDialogues:", scoreDialogue);
      return handlerInput.responseBuilder
        .speak(scoreDialogue + Messages.REPLAY_OR_END_GAME_MESSAGE)
        .getResponse();
    }
  },
};

const StopIntentHandler: Alexa.RequestHandler = {
  canHandle: isIntent("AMAZON.StopIntent"),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(Messages.STOP_MESSAGE)
      .getResponse();
  },
};

const HelpIntentHandler: Alexa.RequestHandler = {
  canHandle: isIntent("AMAZON.HelpIntent"),
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(Messages.HELP_MESSAGE)
      .getResponse();
  },
};

function ErrorHandler(handlerInput: Alexa.HandlerInput, error: Error) {
  return handlerInput.responseBuilder
    .speak(
      ` <amazon:emotion name="excited" intensity="medium">
          Sorry! I don't recognize this command. Please say help to know more about commands or say the correct command.
        </amazon:emotion>
        <sub alias=",">${escapeXmlCharacters(error.message)}</sub>`
    )
    .withShouldEndSession(true)
    .getResponse();
}

export const handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    StopIntentHandler,
    HelpIntentHandler,
    WelcomeIntentHandler,
    StartGameIntentHandler,
    RollDiceIntentHandler,
    GetPlayerNameOrExitIntentHandler,
    ReplayOrEndGameIntentHandler,
    SaveHighScoreIntentHandler
  )
  .addErrorHandler(() => true, ErrorHandler)
  .lambda();
