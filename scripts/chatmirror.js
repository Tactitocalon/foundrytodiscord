Hooks.on("init", function () {
  game.settings.register('foundrytodiscord', 'mainUserId', {
    name: "Main GM ID",
    hint: "If you plan on having two GMs in one session, fill this in with the main DM's ID to avoid duplicated messages. Just type 'dc getID' in chat to have your ID sent to your discord channel.",
    scope: "world",
    config: true,
    default: "",
    type: String
  });
  game.settings.register('foundrytodiscord', 'ignoreWhispers', {
    name: "Ignore Whispers & Private Rolls",
    hint: "If this is on, then it will ignore whispers and private rolls. If this is off, it will send them to discord just like any other message.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean
  });
  game.settings.register('foundrytodiscord', 'addChatQuotes', {
    name: "Add Quotes to Chat",
    hint: "If this is on, then it will surround chat messages with quotes in discord.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean
  });
  game.settings.register('foundrytodiscord', 'inviteURL', {
    name: "Game Invite URL",
    hint: "This should be the internet invite URL for your game session.",
    scope: "world",
    config: true,
    default: "http://",
    type: String
  });
  game.settings.register('foundrytodiscord', 'webHookURL', {
    name: "Web Hook URL",
    hint: "This should be the Webhook's URL from the discord server you want to send chat messages to. Leave it blank to have foundrytodiscord ignore regular chat messages.",
    scope: "world",
    config: true,
    default: "",
    type: String
  });
  game.settings.register('foundrytodiscord', 'rollWebHookURL', {
    name: "Roll Web Hook URL",
    hint: "This is the webhook for wherever you want rolls to appear in discord. Leave it blank to have foundrytodiscord ignore rolls.",
    scope: "world",
    config: true,
    default: "",
    type: String
  });
  if (game.modules.get("polyglot").active) {
    game.settings.register('foundrytodiscord', 'includeOnly', {
      name: "Understand only these languages:",
      hint: "A list of languages that you wish to ONLY be understood to be sent in Discord, separated by commas. Leave blank for normal Polyglot behavior.",
      scope: "world",
      config: true,
      default: "",
      type: String
    });
  }
});

var damageEmoji = []
var systemName;
var hookQueue = [];
var isProcessing = false;
var rateLimitDelay;
var request;

Hooks.on("ready", function () {
  request = new XMLHttpRequest();
  rateLimitDelay = 0;
  request.onreadystatechange = function () {
    if (this.readyState == 4) {
      if (Number(this.getResponseHeader("x-ratelimit-remaining")) == 1 || Number(this.getResponseHeader("x-ratelimit-remaining")) == 0) {
        console.log("foundrytodiscord | Rate Limit reached! Next request in " + (Number(this.getResponseHeader("x-ratelimit-reset-after")) + 1) + " seconds.");
        rateLimitDelay = (Number(this.getResponseHeader("x-ratelimit-reset-after")) + 1) * 1000;
      }
    }
  };
  systemName = game.system.id;
  switch (systemName) {
    case "pf2e":
      damageEmoji = {
        "bludgeoning": ':hammer:',
        "slashing": ':axe:',
        "piercing": ':bow_and_arrow:',
        "acid": ':test_tube:',
        "cold": ':snowflake:',
        "electricity": ':zap:',
        "fire": ':fire:',
        "sonic": ':loud_sound:',
        "chaotic": ':cyclone:',
        "evil": ':smiling_imp:',
        "good": ':angel:',
        "lawful": ':scales:',
        "mental": ':brain:',
        "poison": ':biohazard:',
        "bleed": ':drop_of_blood:',
        "precision": 'dart',
        "negative": ':skull:',
        "void": ':skull:',
        "positive": ':sparkling_heart:',
        "vitality": ':sparkling_heart:',
        "force": ':sparkles:',
        "precision": ':dart:',
        "persistent": ':hourglass:',
        "splash": ':boom:'
      }
      break;
    default:
      break;
  }
});

Hooks.on('createChatMessage', async (msg, userId) => {
  console.log(msg);
  hookQueue.push({ msg, userId });
  if (!isProcessing) {
    isProcessing = true;
    processHookQueue();
  }
  else {
    console.log("foundrytodiscord | Queue is currently busy.")
  }
});

async function processHookQueue() {
  while (hookQueue.length > 0) {
    const { msg, userId } = hookQueue.shift();
    setTimeout(function () {
      processMessage(msg, userId);
      rateLimitDelay = 0;
    }, rateLimitDelay + 1000);
  }
  isProcessing = false;
}

function processMessage(msg, userId) {
  if (!game.user.isGM || (game.settings.get("foundrytodiscord", "ignoreWhispers") && msg.whisper.length > 0)) {
    return;
  }
  if (game.userId != game.settings.get("foundrytodiscord", "mainUserId") && game.settings.get("foundrytodiscord", "mainUserId") != "") {
    return;
  }
  if (msg.isRoll && game.settings.get("foundrytodiscord", "rollWebHookURL") == "") {
    return;
  }
  if (!msg.isRoll && game.settings.get("foundrytodiscord", "webHookURL") == "") {
    return;
  }
  let constructedMessage = '';
  let hookEmbed = [];

  if (msg.content == "dc getID") {
    sendMessage(msg, "UserId: " + userId, hookEmbed);
    return;
  }

  if (!msg.isRoll) {
    //Pf2e
    switch (systemName) {
      case "pf2e":
        if (game.modules.get("polyglot").active && propertyExists(msg, "flags.polyglot.language")) {
          if (msg.flags.polyglot.language != "common") {
            if (game.settings.get("foundrytodiscord", "includeOnly") == "") {
              constructedMessage = PF2e_polyglotize(msg);
            }
            else {
              listLanguages = game.settings.get("foundrytodiscord", "includeOnly").split(",").map(item => item.trim().toLowerCase());
              if (!listLanguages == null) {
                listLanguages = [];
              }
              constructedMessage = PF2e_polyglotize(msg, listLanguages);
            }
          }
        }
        if (PF2e_isCard(msg.content)) {
          constructedMessage = "";
          hookEmbed = PF2e_createCardEmbed(msg);
        }
        break;
      //Add support for other systems here
      default:
        constructedMessage = msg.content; //default message content
        break;
    }
    if (constructedMessage == '') {
      constructedMessage = msg.content;
    }
  }
  else {
    switch (systemName) {
      case "pf2e":
        if (msg.flavor != null && msg.flavor.length > 0) {
          // Construct embed
          hookEmbed = PF2e_createRollEmbed(msg);
        }
        else {
          hookEmbed = createGenericRollEmbed(msg);
        }
        break;
      //Add rolls support for other systems here, since rolls are fundamentally different in every system
      default:
        console.log("foundrytodiscord | System \"" + systemName + "\" is not supported for special roll embeds.")
        hookEmbed = createGenericRollEmbed(msg);
    }
  }

  //Fix formatting before sending
  if (hookEmbed != [] && hookEmbed.length > 0) {
    hookEmbed[0].description = reformatMessage(hookEmbed[0].description);
    //use anonymous behavior and replace instances of the token/actor's name in titles and descriptions
    //sadly, the anonymous module does this right before the message is displayed in foundry, so we have to parse it here.
    if (game.modules.get("anonymous").active) {
      let anon = game.modules.get("anonymous").api;
      let curScene = game.scenes.get(msg.speaker.scene);
      if (curScene) {
        let speakerToken = curScene.tokens.get(msg.speaker.token);
        if (speakerToken) {
          if (!anon.playersSeeName(speakerToken.actor)) {
            hookEmbed[0].title = hookEmbed[0].title.replaceAll(speakerToken.name, anon.getName(speakerToken.actor))
              .replaceAll(speakerToken.name.toLowerCase(), anon.getName(speakerToken.actor).toLowerCase())
              .replaceAll(speakerToken.actor.name, anon.getName(speakerToken.actor))
              .replaceAll(speakerToken.actor.name.toLowerCase(), anon.getName(speakerToken.actor).toLowerCase());
            hookEmbed[0].description = hookEmbed[0].description.replaceAll(speakerToken.name, anon.getName(speakerToken.actor))
              .replaceAll(speakerToken.name.toLowerCase(), anon.getName(speakerToken.actor).toLowerCase())
              .replaceAll(speakerToken.actor.name, anon.getName(speakerToken.actor))
              .replaceAll(speakerToken.actor.name.toLowerCase(), anon.getName(speakerToken.actor).toLowerCase());
          }
        }
      }
    }
    sendMessage(msg, "", hookEmbed);
    return;
  }
  constructedMessage = reformatMessage(constructedMessage);

  sendMessage(msg, constructedMessage, hookEmbed);
}

/*Base functions*/
function sendMessage(message, msgText, hookEmbed) {
  let imgurl = generateDiscordAvatar(message);
  let hook = "";
  if (message.isRoll) {
    hook = game.settings.get("foundrytodiscord", "rollWebHookURL");
  } else {
    hook = game.settings.get("foundrytodiscord", "webHookURL");
  }

  sendToWebhook(message, msgText, hookEmbed, hook, imgurl);
}

function sendToWebhook(message, msgText, hookEmbed, hook, imgurl) {
  request.open('POST', hook);
  request.setRequestHeader('Content-type', 'application/json');
  let alias = message.alias;
  let speakerActor;
  if (game.modules.get("anonymous").active) {
    let anon = game.modules.get('anonymous').api;
    //First priority: Use speaker token name and check if actor's name is visible through anonymous
    if (propertyExists(message, "speaker.token")) {
      if (message.speaker.token !== "") {
        const scene = game.scenes.find(scene => scene.id === message.speaker.scene);
        if (scene) {
          const speakerToken = scene.tokens.get(message.speaker.token);
          if (speakerToken.actor) {
            speakerActor = speakerToken.actor
          }
          else { // TODO: failsafe, in case the actor doesn't exist, i.e. through a broken module or a module imported from another system

          }
        }
      }
    }
    else {
      speakerActor = game.actors.get(actor => actor.name === message.alias);
    }
    if (speakerActor) {
      if (!anon.playersSeeName(speakerActor) && speakerActor.type !== "character") {
        alias = anon.getName(speakerActor) + " (" + speakerActor.id + ")";
      }
    }
  }

  const params = {
    username: alias,
    avatar_url: imgurl,
    content: msgText,
    embeds: hookEmbed
  };
  console.log("foundrytodiscord | Attempting to send message to webhook...");
  request.send(JSON.stringify(params));
  isProcessing = false;
}

function parseHTMLText(htmlString) {
  let reformattedText = htmlString;

  //cleanup newlines in raw text before parsing
  let regex = /<[^>]*>[^<]*\n[^<]*<\/[^>]*>/g;
  reformattedText = reformattedText.replace(regex, (match) => match.replace(/\n/g, ''));

  //remove text that is not visible to players
  let htmldoc = document.createElement('div');
  htmldoc.innerHTML = reformattedText;
  let divs = htmldoc.querySelectorAll('div[data-visibility="gm"]');
  for (let i = 0; i < divs.length; i++) {
    divs[i].parentNode.removeChild(divs[i]);
  }
  reformattedText = htmldoc.innerHTML;
  divs = htmldoc.querySelectorAll('div[data-visibility="owner"]');
  for (let i = 0; i < divs.length; i++) {
    divs[i].parentNode.removeChild(divs[i]);
  }
  reformattedText = htmldoc.innerHTML;
  divs = htmldoc.querySelectorAll('span[data-visibility="owner"]');
  for (let i = 0; i < divs.length; i++) {
    divs[i].parentNode.removeChild(divs[i]);
  }
  reformattedText = htmldoc.innerHTML;

  //remove <img> tags
  htmldoc.innerHTML = reformattedText;
  htmldoc.querySelectorAll('img').forEach(img => img.remove());
  reformattedText = htmldoc.innerHTML;

  //status effect cards:
  let statuseffectlist = htmldoc.querySelectorAll('.statuseffect-rules');

  //construct status effects:
  if (statuseffectlist.length != 0) {
    let statfx = ""
    statuseffectlist.forEach(effect => {
      statfx = statfx + effect.innerHTML.replace(/<p>.*?<\/p>/g, '') + "\n";
    });
    const tempdivs = document.createElement('div')
    tempdivs.innerHTML = reformattedText;
    let targetdiv = tempdivs.querySelector('.dice-total.statuseffect-message');
    if (targetdiv) {
      targetdiv.innerHTML = statfx;
    }
    reformattedText = tempdivs.innerHTML;
  }

  //format header tags to bold instead
  regex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/g;
  reformattedText = reformattedText.replace(regex, '**$1**');

  regex = /<em[^>]*>(.*?)<\/em>/g;
  reformattedText = reformattedText.replace(regex, '*$1*');

  regex = /<(span|a)\s+[^>]*data-pf2-check="([^"]*)"[^>]*>(.*?)<\/(span|a)>/g;

  reformattedText = reformattedText.replace(regex, (match, trait, content) => {
    const formattedString = `:game_die:\`${content}\``;

    return formattedString;
  });


  //remove all indentation and formatting, aka just make it ugly so we can actually parse the next part of it
  reformattedText = reformattedText.replace(/>\s+</g, '><');

  //remove <li>
  reformattedText = reformattedText.replace(/<li>/g, "");
  reformattedText = reformattedText.replace(/<\/li>/g, "\n");

  //remove remaining <div> tags
  reformattedText = reformattedText.replace(/<div>/g, "");
  reformattedText = reformattedText.replace(/<\/div>/g, "\n");
  //remove line breaks
  reformattedText = reformattedText.replace(/<br\s*\/?>/gi, '\n');
  //remove <p>
  reformattedText = reformattedText.replace(/<p>/g, "");
  reformattedText = reformattedText.replace(/<\/p>/g, "\n");

  //remove the rest
  reformattedText = reformattedText.replace(/<[^>]*>?/gm, "");

  //cleanup time
  regex = /\n\s+/g;
  reformattedText = reformattedText.replace(regex, "\n");
  regex = / {2,}/g;
  reformattedText = reformattedText.replace(regex, " ");

  return reformattedText.trim();
}

function reformatMessage(text) {
  let reformattedText = ""
  //First check if the text is formatted in HTML to use a different function
  //parse Localize first, since it will have html elements
  regex = /@Localize\[(.*?)\]/g;
  reformattedText = text.replace(regex, (_, text) => getLocalizedText(text));
  isHtmlFormatted = /<[a-z][\s\S]*>/i.test(reformattedText);
  if (isHtmlFormatted) {
    reformattedText = parseHTMLText(reformattedText);
    reformattedText = reformatMessage(reformattedText); //call this function again as a failsafe for @ tags
  }
  else {
    //replace UUIDs to be consistent with Foundry
    let regex = /@UUID\[[^\]]+\]\{([^}]+)\}/g;
    reformattedText = reformattedText.replace(regex, ':baggage_claim: `$1`');

    //replace compendium links
    regex = /@Compendium\[[^\]]+\]\{([^}]+)\}/g;
    reformattedText = reformattedText.replace(regex, ':baggage_claim: `$1`');

    //replace @Damage appropriately (for PF2e)
    reformattedText = PF2e_replaceDamageFormat(reformattedText);

    //replace UUID if custom name is not present (redundancy)
    regex = /@UUID\[(.*?)\]/g;
    reformattedText = reformattedText.replace(regex, (_, text) => getNameFromItem(text));

    //replace Checks
    regex = /@Check\[[^\]]+\]{([^}]+)}/g;
    reformattedText = reformattedText.replace(regex, ':game_die: `$1`');

    //replace checks without name labels, different arguments on every system for @Check, so pf2e gets a different one
    regex = /@Check\[(.*?)\]/g;
    switch (systemName) {
      case "pf2e":
        reformattedText = reformattedText.replace(regex, (_, text) => PF2e_getNameFromCheck(text));
        break;
      default:
        break;
    }
  }

  return reformattedText;
}

function generateDiscordAvatar(message) {
  if (propertyExists(message, "speaker.scene")) {
    if (message.speaker.token) {
      const speakerToken = game.scenes.find(scene => scene.id === message.speaker.scene).tokens.get(token => token.id === message.speaker.token);
      if (propertyExists(speakerToken, "texture.src")) {
        if (speakerToken.texture.src != "") {
          return generateimglink(speakerToken.texture.src);
        }
      }
    }
  }

  if (propertyExists(message, "speaker.actor")) {
    const speakerActor = game.actors.find(actor => actor.id === message.speaker.actor);
    if (speakerActor) {
      if (propertyExists(speakerActor, "prototypeToken.texture.src")) {
        return generateimglink(speakerActor.prototypeToken.texture.src);
      }
    }
  }

  const aliasMatchedActor = game.actors.find(actor => actor.name === message.alias);
  if (propertyExists(aliasMatchedActor, "prototypeToken.texture.src")) {
    return generateimglink(aliasMatchedActor.prototypeToken.texture.src);
  }

  return generateimglink(message.user.avatar);
}

function generateimglink(img) {
  if (img.includes("http")) {
    return img;
  } else {
    return (game.settings.get("foundrytodiscord", "inviteURL") + img);
  }
}

//function to crawl through several objects and check if the last one exists or until one is undefined
//example usage: propertyExists(msg, "speaker.token");
function propertyExists(jsonObj, propertyPath) {
  const properties = propertyPath.split('.');
  let currentObj = jsonObj;

  for (const property of properties) {
    if (currentObj && typeof currentObj === 'object' && property in currentObj) {
      currentObj = currentObj[property];
    } else {
      return false;
    }
  }

  return true;
}

/*System-agnostic (hopefully) functions*/
function createGenericRollEmbed(message) {
  let desc = ""
  message.rolls.forEach(roll => {
    desc = desc + 'Rolled ' + roll.formula + ', and got a ' + roll.result + ' = ' + roll.total;
  })
  embed = [{ title: message.alias + '\'s Rolls', description: desc }];
  return embed;
}

function getLocalizedText(localizationKey) {
  return game.i18n.localize(localizationKey);
}

function getNameFromItem(itempath) {
  let itemID = ""
  let itemName = ""
  const parts = (itempath).split('.');
  if (parts.length > 1) {
    itemID = parts[parts.length - 1];
  }
  switch (parts[0]) {
    case "Actor":
      let actorID = parts[1];
      let actor = game.actors.get(actorID);
      let item = actor.items.find(item => item._id === itemID);
      itemName = item ? item.name : undefined;
      break;
    case "Compendium":
      let compendiumName = ""
      for (let i = 1; i < parts.length - 2; i++) {
        compendiumName = compendiumName + parts[i];
        if (i < parts.length - 3) {
          compendiumName = compendiumName + ".";
        }
      }
      itemName = game.packs.get(compendiumName).get(itemID).name;
      break;
    default:
      if (itemID == "") {
        itemID = (itempath);
      }
      itemName = ":baggage_claim: `" + game.items.get(itemID).name + "`";
      return itemName;
      break;
  }

  if (itemName) {
    return ":baggage_claim: `" + itemName + "`";
  }
  else { //Failsafe just in case.
    return ":baggage_claim: `undefined`";
  }
}

function parseCheckString(checkString) {
  let check = {};

  // Split the string into an array of key-value pairs
  let pairs = checkString.split("|");

  // Loop through the pairs and add them to the check object
  for (let i = 0; i < pairs.length; i++) {
    let [key, value] = pairs[i].split(":");
    check[key] = value === "true" ? true : value === "false" ? false : value;
  }

  return check;
}


/*PF2e-specific functions*/
function PF2e_createRollEmbed(message) {
  let embed = []
  //Build Title
  const str = message.flavor;
  let regex = /<h4 class="action">(.*?)<\/h4>/g;
  let m;
  let title = "";
  while ((m = regex.exec(str)) !== null) {
    if (m.index === regex.lastIndex) {
      regex.lastIndex++;
    }
    if (m[1] != null) {
      title = m[1];
    }
  }

  if (title == "") {
    regex = /<strong>(.*?)<\/strong>/g;
    while ((m = regex.exec(str)) !== null) {
      if (m.index === regex.lastIndex) {
        regex.lastIndex++;
      }
      if (m[1] != null) {
        title = m[1];
      }
    }
  }

  if (game.modules.get("anonymous").active) {
    var anon = game.modules.get('anonymous').api; //optional implementation for "anonymous" module
  }

  let desc = "";

  //Build Description
  //Add targets to embed:
  if (game.modules.get("pf2e-target-damage").active) { //optional implementation for "pf2e-target-damage" module
    if (message.flags['pf2e-target-damage'].targets.length === 1) {
      desc = desc + "**:dart:Target: **";
    }
    else if (message.flags['pf2e-target-damage'].targets.length > 1) {
      desc = desc + "**:dart:Targets: **";
    }

    message.flags['pf2e-target-damage'].targets.forEach(target => {
      const curScene = game.scenes.find(scene => scene.id === message.speaker.scene);
      const curToken = curScene.tokens.get(target.id);
      if (game.modules.get("anonymous").active) {
        if (!anon.playersSeeName(curToken.actor)) {
          desc = desc + "`" + anon.getName(curToken.actor) + "` ";
        }
        else {
          desc = desc + "`" + curToken.name + "` ";
        }
      }
      else {
        desc = desc + "`" + curToken.name + "` ";
      }
    });
  }
  else {
    if (propertyExists(message, "flags.pf2e.context.target.token")) {
      desc = desc + "**:dart:Target: **";
      targetTokenId = message.flags.pf2e.context.target.token.split(".")[3];
      targetToken = game.scenes.find(scene => scene.id === message.speaker.scene).tokens.get(targetTokenId);
      if (targetToken) {
        if (game.modules.get("anonymous").active) {
          if (!anon.playersSeeName(targetToken.targetToken.actor)) {
            desc = desc + "`" + anon.getName(targetToken.actor) + "` ";
          }
          else {
            desc = desc + "`" + targetToken.name + "` ";
          }
        }
        else {
          desc = desc + "`" + targetToken.name + "` ";
        }
      }
    }
  }
  desc = desc + "\n";

  //Add roll information to embed:
  for (let i = 0; i < message.rolls.length; i++) {
    desc = desc + "**:game_die:Result: **" + "__**" + message.rolls[i].total + "**__";
    if (propertyExists(message, "flags.pf2e.context.type") && message.flags.pf2e.context.type == "damage-roll") {
      desc = desc + PF2e_parseDamageTypes(message.rolls[i]);
    }
    else if (PF2e_parseDegree(message.rolls[i].options.degreeOfSuccess) != "Invalid") {
      desc = desc + " `(" + PF2e_parseDegree(message.rolls[i].options.degreeOfSuccess) + ")`";
    }
    desc = desc + "\n";
  }
  embed = [{ title: title, description: desc }];
  return embed;
}

function PF2e_parseDamageTypes(baserolls) {
  let damages = ""
  if (!baserolls.options.splashOnly) {
    baserolls.terms.forEach((term, i) => {
      term.rolls.forEach((roll, j) => {
        let precision = false;
        let splash = false;
        roll.terms.forEach((typeterm, k) => {
          if (propertyExists(typeterm, "term.options.flavor")) {
            precision = typeterm.term.options.flavor == "precision";
            splash = typeterm.term.options.flavor == "splash";
          }

        });
        if (!roll.persistent) {
          damages = damages + roll._total.toString();

        }
        else {
          let persFormula = roll.formula;
          const regex = /[^\d+d\d+\s*+-]/g;
          persFormula = persFormula.replace(regex, '');
          damages = damages + persFormula.trim();
        }
        damages = damages + (roll.persistent ? damageEmoji["persistent"] : "") + (precision ? damageEmoji["precision"] : "") + (splash ? damageEmoji["splash"] : "");
        if (!damageEmoji[roll.type]) {
          damages = damages + "[" + roll.type + "]";
        }
        else {
          damages = damages + damageEmoji[roll.type];
        }
        if (j != term.rolls.length - 1) {
          damages = damages + " + ";
        }
      });
    });
  }
  else {
    baserolls.terms.forEach((term, i) => {
      term.rolls.forEach((roll, j) => {
        damages = damages + roll.total + damageEmoji["splash"];
        if (damageEmoji[roll.type]) {
          damages = damages + damageEmoji[roll.type];
        }
        else {
          damages = damages + "[" + roll.type + "]";
        }
      });
    });
  }
  return " ||**(" + damages + ")**||";
}

function PF2e_createCardEmbed(message) {
  const card = message.content;
  const parser = new DOMParser();
  let doc = parser.parseFromString(card, "text/html");
  // Find the <h3> element and extract its text content
  const h3Element = doc.querySelector("h3");
  let title = h3Element.textContent.trim();
  let desc = "";

  //parse traits
  let tags;
  let tagsSection = doc.querySelector(".item-properties.tags");
  try {
    tags = Array.from(tagsSection.querySelectorAll(".tag")).map(tag => tag.textContent);
  }
  catch (error) {
    try {
      tagsSection = doc.querySelector('.tags');
      tags = Array.from(tagsSection.querySelectorAll(".tag")).map(tag => tag.textContent);
    }
    catch (error) {

    }
  }
  let traits = "";
  if (tags.length) {
    for (let i = 0; i < tags.length; i++) {
      traits = traits + "[" + tags[i] + "] ";
    }
  }

  if (traits.trim() !== "") {
    desc = desc + "`" + traits.trim() + "`\n";
  }
  //parse spell description
  let descList = doc.querySelectorAll(".card-content > p");
  descList.forEach(function (paragraph) {
    let text = paragraph.innerHTML
      .replace(/<strong>(.*?)<\/strong>/g, '**$1**')  // Replace <strong> tags with markdown bold
      .trim();  // Trim any leading/trailing whitespace

    desc += text + "\n\n";
  });

  const heightenedTags = doc.querySelectorAll("section.card-content p strong");
  const reformattedTexts = Array.from(heightenedTags).map((tag) => {
    const nextSibling = tag.nextSibling;
    return `**${tag.textContent.trim()}** ${nextSibling.textContent.trim()}`;
  });

  const reformattedText = reformattedTexts.join("\n");
  if (reformattedText !== "") {
    desc = desc + "----------------\n\n"
    desc = desc + reformattedText;
  }

  embed = [{ title: title, description: desc, footer: { text: PF2e_getCardFooter(card) } }];
  return embed;
}

function PF2e_getCardFooter(card) {
  // Create a temporary div element to parse the HTML string
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = card;

  // Select the footer element
  const footerElement = tempDiv.querySelector('.card-footer');

  if (!footerElement) {
    return ''; // Return an empty string if no footer element is found
  }

  // Extract all <span> elements within the footer
  const spanElements = footerElement.querySelectorAll('span');

  // Create an array to store the text content of <span> elements
  const spanTexts = [];
  spanElements.forEach(span => {
    spanTexts.push(span.textContent);
  });

  // Create the "footer" string by joining the span texts with spaces
  const footer = spanTexts.join(' ');

  return footer;
}

function PF2e_parseDegree(degree) {
  switch (degree) {
    case 0:
      return "Critical Failure";
    case 1:
      return "Failure";
    case 2:
      return "Success";
    case 3:
      return "Critical Success";
    default:
      return "Invalid";
  }
}

function PF2e_isCard(htmlString) {

  const htmldocElement = document.createElement('div');
  htmldocElement.innerHTML = htmlString;

  const divElement = htmldocElement.querySelector('div.pf2e.chat-card');

  if (divElement !== null) {
    return true;
  } else {
    return false;
  }
}

function PF2e_polyglotize(message, playerlanguages = []) {
  //get a list of all PCs
  if (playerlanguages == [] || playerlanguages.length == 0) {
    let characters = game.actors.filter(a => a.type === "character");
    let languages = new Set();
    for (let character of characters) {
      let characterLanguages = character.system.traits.languages.value;
      for (let language of characterLanguages) {
        languages.add(language);
      }
    }

    if (languages.has(message.flags.polyglot.language)) {
      return message.content;
    }
    else {
      return "*Unintelligible*"
    }
  }
  else {
    if (playerlanguages.includes(message.flags.polyglot.language)) {
      return message.content;
    }
    else {
      return "*Unintelligible*"
    }
  }
}

function PF2e_getNameFromCheck(checkString) {

  const check = parseCheckString(checkString);
  if (check.type) {
    skillcheck = check.type.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    if (check.basic) {
      return ":game_die: `Basic " + skillcheck + "`";
    }
    else {
      return ":game_die: `" + skillcheck + "`";
    }
  }
}

function PF2e_replaceDamageFormat(damagestring) {
  const regex = /@Damage\[(\d+d\d+\[[^\]]+\](?:, ?)?)+\]/g;
  return damagestring.replace(regex, (match) => {
    const diceParts = match.match(/\d+d\d+\[[^\]]+\]/g);
    const formattedDice = diceParts.map(part => {
      const [dice, desc] = part.match(/(\d+d\d+)\[([^\]]+)\]/).slice(1);
      return `${dice} ${desc}`;
    }).join(' + ');
    return `:game_die: ${formattedDice}`;
  });
}
