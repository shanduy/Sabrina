// ========================================== //
//            SABRINABOT by shan             //
// ========================================== //

// IMPORTACIÓN DE LIBRERÍAS

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require('qrcode');
const readline = require("readline");
const path = require("path");
const fs = require("fs");
const os = require("os");
const ffmpeg = require("fluent-ffmpeg");
const webp = require("node-webpmux");
const axios = require("axios");
const yts = require("yt-search");
const https = require("https");
const http = require("http");
const { exec } = require("child_process");

// MENUS
const { getMainMenu } = require("./archivos/menus/main");
const { getStickersMenu } = require("./archivos/menus/stickers");
const { getGrupoMenu } = require("./archivos/menus/grupo");
const { getDescargasMenu } = require("./archivos/menus/descargas");
const { getNsfwMenu } = require("./archivos/menus/nsfw");
const { getAccionesMenu } = require("./archivos/menus/acciones");
const { getSabrinamMenu } = require("./archivos/menus/sabrinam");
const { getJuegosMenu } = require("./archivos/menus/juegos");
const { getCasinoMenu } = require("./archivos/menus/casino");
const { getModoMenu } = require("./archivos/menus/modo");

// PRECARGA DE ARCHIVOS MULTIMEDIA EN RAM (MEMORIA CACHÉ)
const RUTA_SABRINA_JPG = path.join(__dirname, "archivos", "media", "sabrina.jpg");
const RUTA_SABRINAC_JPG = path.join(__dirname, "archivos", "media", "sabrinac.jpg");
const RUTA_NOKICK_WEBP = path.join(__dirname, "archivos", "media", "no-kick.webp");
const RUTA_AUDIO_SABRINA = path.join(__dirname, "archivos", "mp3", "sabrina.ogg");
const RUTA_AUDIO_BANEADO = path.join(__dirname, "archivos", "mp3", "baneado.ogg");

const CACHE_MEDIA = {
  sabrinaJpg: fs.existsSync(RUTA_SABRINA_JPG) ? fs.readFileSync(RUTA_SABRINA_JPG) : null,
  sabrinaCJpg: fs.existsSync(RUTA_SABRINAC_JPG) ? fs.readFileSync(RUTA_SABRINAC_JPG) : null,
  noKickWebp: fs.existsSync(RUTA_NOKICK_WEBP) ? fs.readFileSync(RUTA_NOKICK_WEBP) : null,
  audioSabrina: fs.existsSync(RUTA_AUDIO_SABRINA) ? fs.readFileSync(RUTA_AUDIO_SABRINA) : null,
  audioBaneado: fs.existsSync(RUTA_AUDIO_BANEADO) ? fs.readFileSync(RUTA_AUDIO_BANEADO) : null,
};

// 📌 Almacén global de silenciados (Debe ir FUERA de sock.ev.on)
const mutedUsers = {};

// Configurar FFmpeg con detección multisistema (Termux / HideCloud / VPS)
let ffmpegPath = "ffmpeg";
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
    ffmpegPath = ffmpegInstaller.path;
  }
} catch (e) {
  // Si no está instalado el paquete installer, recurre a la binaria global
  ffmpegPath = "ffmpeg";
}
process.env.FFMPEG_PATH = ffmpegPath;
ffmpeg.setFfmpegPath(ffmpegPath);

// Crear y redefinir la carpeta temporal dentro de tu proyecto
const localTmpDir = path.join(__dirname, "temp");
if (!fs.existsSync(localTmpDir)) {
  fs.mkdirSync(localTmpDir, { recursive: true });
}

process.env.TMPDIR = localTmpDir;
process.env.TEMP = localTmpDir;
process.env.TMP = localTmpDir;

// Función para vaciar la carpeta temporal del servidor sin importar la extensión
function borrarTemporalesOcultos() {
  try {
    const tmpFolder = os.tmpdir();
    if (fs.existsSync(tmpFolder)) {
      const files = fs.readdirSync(tmpFolder);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(tmpFolder, file));
        } catch (e) {
          // Ignora si el archivo está siendo usado en ese instante
        }
      }
    }
  } catch (e) {
    console.error("⚠️ Error limpiando temporales:", e.message);
  }
}

// Ejecutar limpieza al iniciar
borrarTemporalesOcultos();
setInterval(borrarTemporalesOcultos, 30 * 60 * 1000);

// TODOS los miembros pueden usar el bot en cualquier grupo
const modoSoloAdmins = new Set();

// Otorga permisos de ejecución a yt-dlp automáticamente en Linux
if (fs.existsSync("./yt-dlp")) {
  exec("chmod +x ./yt-dlp");
}

let botActivado = true;
let antilinkActivado = false;
let juegosActivados = true;
let accionesActivadas = true;

const accionesMap = {
  besar: "besar",
  beso: "besar",
  abrazo: "abrazo",
  follar: "follar",
  coger: "follar",
  nalgada: "nalgada",
  nalgear: "nalgada",
  cumear: "cumear",
  cum: "cumear",
  footjob: "footjob",
  boobjob: "boobjob",
  balazo: "balazo",
  paja: "paja",
  dormir: "dormir",
  mear: "mear",
  meo: "mear",
  anal: "anal",
  dedear: "dedear",
  bailar: "bailar", 
  dance: "bailar",
  venirse: "venirse",
  venir: "venirse",
};

// FUNCIONES NSFW
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const reqModule = url.startsWith("https") ? https : http;
    const req = reqModule.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return downloadBuffer(res.headers.location)
            .then(resolve)
            .catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP Status ${res.statusCode}`));
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", (err) => reject(err));
      },
    );

    req.on("error", (err) => reject(err));
  });
}

// LÓGICA DE BASE DE DATOS (DATABASE)
const dbPath = path.join(__dirname, "database.json");
let casinoActivo = true;
let audiosActivados = true;
let nsfwActivado = false;

function getStats(userId) {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify({}, null, 2));
    }

    const content = fs.readFileSync(dbPath, "utf8");
    const data = content.trim() === "" ? {} : JSON.parse(content);

    if (!data[userId]) {
      data[userId] = { balance: 100, lastWork: 0 };
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    }
    return data[userId];
  } catch (e) {
    console.error("Error en getStats:", e);
    return { balance: 100, lastWork: 0 };
  }
}

function updateBalance(userId, amount) {
  try {
    const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    if (!data[userId]) data[userId] = { balance: 100, lastWork: 0 };

    data[userId].balance += amount;
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error en updateBalance:", e);
  }
}

// FUNCIÓN AUXILIAR: DESCARGAR ARCHIVOS MULTIMEDIA
async function descargarMedia(message) {
  const type = Object.keys(message)[0];
  const stream = await downloadContentFromMessage(
    message[type],
    type.replace("Message", ""),
  );
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

// INICIALIZACIÓN DEL CLIENTE (BAILEYS)
// INICIALIZACIÓN DEL CLIENTE (BAILEYS)
async function iniciarBot() {
  let authState;
  try {
    authState = await useMultiFileAuthState("baileys_auth");
  } catch (e) {
    console.error("Error al cargar credenciales:", e);
    return;
  }
  const { state, saveCreds } = authState;

  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1015901307],
  }));

  // Comprobación directa en creds.json sin depender del tiempo de carga del objeto
  const credsPath = path.join(__dirname, "baileys_auth", "creds.json");
  let yaRegistrado = false;

  if (fs.existsSync(credsPath)) {
    try {
      const rawCreds = fs.readFileSync(credsPath, "utf-8");
      const parsedCreds = JSON.parse(rawCreds);
      // Si creds.json ya contiene datos del usuario registrado (me.id)
      if (parsedCreds && (parsedCreds.me || parsedCreds.registered)) {
        yaRegistrado = true;
      }
    } catch (err) {
      yaRegistrado = false;
    }
  }

  let usarPairingCode = false;
  let numeroTelefono = "";

  // SOLO solicita vinculación si NO está registrado en el archivo creds.json
  if (!yaRegistrado) {
    const isInteractive = process.stdin.isTTY;

    if (isInteractive) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const pedirOpcion = () =>
        new Promise((resolve) => {
          console.log("\n====================================");
          console.log(" 🤖 SABRINA MÉTODOS DE VINCULACIÓN ");
          console.log("====================================");
          console.log("1. Vincular con Código de 8 dígitos");
          console.log("2. Vincular con Código QR");
          console.log("====================================");
          console.log("👉 Selecciona una opción (1 o 2):");

          rl.question("", (opcion) => {
            resolve(opcion.trim());
          });
        });

      const opcion = await pedirOpcion();

      if (opcion === "1") {
        usarPairingCode = true;
        const numeroResp = await new Promise((resolve) => {
          console.log("\n📱 Ingresa tu número de WhatsApp con el prefijo de tu país (ej: 593xxxxxxxx):");
          rl.question("", (num) => resolve(num));
        });
        rl.close();
        numeroTelefono = numeroResp.replace(/\D/g, "");
      } else {
        console.log("\n📲 Generando Código QR en la terminal...\n");
        rl.close();
      }
    } else {
      if (process.env.PHONE_NUMBER) {
        usarPairingCode = true;
        numeroTelefono = process.env.PHONE_NUMBER.replace(/\D/g, "");
      }
    }
  }

  const sock = makeWASocket({
    version,
    logger: pino({ level: "fatal" }),
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });

  sock.ev.on("creds.update", saveCreds);

  if (usarPairingCode && numeroTelefono && !yaRegistrado) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(numeroTelefono);
        console.log(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}\n`);
      } catch (err) {
        console.error("Error al generar el código de vinculación:", err);
      }
    }, 3000);
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !usarPairingCode && !yaRegistrado) {
      try {
        const qrTerminal = await QRCode.toString(qr, { type: "terminal", small: true });
        console.log(qrTerminal);
      } catch (err) {
        console.error("Error al renderizar el código QR:", err);
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `🔴 Conexión cerrada (Status: ${statusCode}). Reconectando: ${shouldReconnect}`
      );
      if (shouldReconnect) setTimeout(iniciarBot, 3000);
    } else if (connection === "open") {
      console.log("\n✅ --- Sabrina ESTÁ ONLINE Y ESCUCHANDO MENSAJES ---");
    }
  });

  sock.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      const msg = chatUpdate.messages?.[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (!from || from === "status@broadcast") return;

      const isGroup = from.endsWith("@g.us");

      const botJid = sock.user?.id || sock.user?.jid || "";
      const sender = isGroup
        ? msg.key.participant || msg.participant || (msg.key.fromMe ? botJid : "")
        : msg.key.fromMe
        ? botJid
        : msg.key.remoteJid;

      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      const text = body.trim().toLowerCase();
      const comando = text.split(/\s+/)[0];
      const cmdMenu = comando;

      let esAdmin = false;
      let isBotAdmin = false;

      if (isGroup) {
        try {
          const groupMetadata = await sock.groupMetadata(from);
          const participants = groupMetadata?.participants || [];
          
          const numBot = botJid.split("@")[0].split(":")[0].replace(/\D/g, "");
          const lidBot = sock.user?.lid ? sock.user.lid.split("@")[0].split(":")[0].replace(/\D/g, "") : "";
          const numSender = sender.split("@")[0].split(":")[0].replace(/\D/g, "");

          const senderPart = participants.find((p) => {
            const pNum = p.id.split("@")[0].split(":")[0].replace(/\D/g, "");
            return pNum === numSender;
          });

          const botPart = participants.find((p) => {
            const pNum = p.id.split("@")[0].split(":")[0].replace(/\D/g, "");
            return pNum === numBot || (lidBot && pNum === lidBot);
          });

          esAdmin = senderPart?.admin === "admin" || senderPart?.admin === "superadmin";
          isBotAdmin = botPart?.admin === "admin" || botPart?.admin === "superadmin";
        } catch (e) {
          console.error("Error obteniendo roles de grupo:", e);
        }
      }

      // === FUNCIÓN AUXILIAR: SIMULAR ESCRITURA O GRABACIÓN HUMANA (OPTIMIZADA A RANGOS RÁPIDOS) ===
      const simularEscrituraHumana = async (jid, tipo = "composing", tiempoMs = 400) => {
        try {
          await sock.sendPresenceUpdate("available");
          await sock.presenceSubscribe(jid).catch(() => {});
          await sock.sendPresenceUpdate(tipo, jid);
          await new Promise((resolve) => setTimeout(resolve, tiempoMs));
          await sock.sendPresenceUpdate("paused", jid);
        } catch (e) {
          console.error("Error en simulación de presencia:", e);
        }
      };

      // === FUNCIÓN RESPONDER CON RESPUESTA RÁPIDA ===
      const responder = async (texto, opciones = {}) => {
        await simularEscrituraHumana(from, "composing", 300);
        return await sock.sendMessage(from, { text: texto, ...opciones }, { quoted: msg });
      };

      if (body) {
        const nombreEmisor = sender
          ? sender.split("@")[0].split(":")[0]
          : "Desconocido";
        console.log(
          `📩 [${isGroup ? "GRUPO" : "PRIVADO"}] de ${nombreEmisor}: ${body}`
        );
      }

      // ========================================== //
      // COMANDOS DE SABRINABOT                     //
      // ========================================== //

      // COMANDO !creador
      if (text === '!creador' || text === '.creador') {
        try {
          const phoneNumber = '593963365388';
          const vcard = 'BEGIN:VCARD\n'
            + 'VERSION:3.0\n'
            + 'FN:shan\n'
            + 'ORG:Creador de Sabrina;\n'
            + `TEL;type=CELL;type=VOICE;waid=${phoneNumber}:+${phoneNumber}\n`
            + 'END:VCARD';

          const textMsg = `💖 *¡Gracias por instalar a Sabrina!*\n\n` +
                          `Espero que disfrutes del bot y te sea de gran utilidad.\n` +
                          `Si tienes alguna duda, sugerencia o problema, puedes contactarme directamente. ✨`;

          await responder(textMsg);

          await sock.sendMessage(from, {
            contacts: {
              displayName: 'shan',
              contacts: [{ vcard }]
            }
          });

          if (CACHE_MEDIA.audioSabrina) {
            await simularEscrituraHumana(from, "recording", 600);
            await sock.sendMessage(
              from,
              {
                audio: CACHE_MEDIA.audioSabrina,
                ptt: true,
                mimetype: "audio/ogg; codecs=opus"
              },
              { quoted: msg }
            );
          }
        } catch (error) {
          console.error("❌ Error en el comando !creador:", error.message);
        }
      }

      // Comando !repo o !repositorio
      if (comando === '!repo' || comando === '!repositorio') {
          const repoText = `💋 *Sabrina - Repositorio Oficial*\n\n` +
                           `¿Quieres crear tu propio bot?\n` +
                           `Visita el repositorio en GitHub, dale una estrella ⭐ y sigue la guía de instalación:\n\n` +
                           `Video de instalación:\n` +
                           `https://www.youtube.com/watch?v=vjPCZNuXsTw\n\n` +
                           `Repositorio:\n` +
                           `https://github.com/shanduy/Sabrina\n\n` +
                           `¡Gracias por el apoyo!`;

          await responder(repoText);
      }

      // CANAL DE SABRINA (SOLO TEXTO Y ENLACE)
      if (comando === '!canal') {
          try {
              const canalUrl = 'https://whatsapp.com/channel/0029Vb8bws31iUxZGJYZpK0o';

              const mensajeTexto = `*CANAL OFICIAL DE SABRINA* 💋\n\n` +
                  `¡Únete a nuestro canal para no perderte nada!\n\n` +
                  `✨ *¿Qué encontrarás aquí?*\n` +
                  `🔹 Novedades y actualizaciones.\n` +
                  `🔹 Anuncios sobre nuevos comandos y funciones.\n` +
                  `🔹 Puedes reportar porblemas o mal funcionamiento del bot.\n` +
                  `🔹 Tus comentarios para nuevas funciones.\n\n` +
                  `👉 *Haz clic en el enlace de abajo para unirte:*\n${canalUrl}`;

              await simularEscrituraHumana(from, "composing", 300);
              await sock.sendMessage(from, { text: mensajeTexto }, { quoted: msg });

          } catch (error) {
              console.error('Error al ejecutar el comando canal/updates:', error);
              await responder('❌ Ocurrió un error al enviar la información del canal.');
          }
      }


      // CONTROL DE ENCENDIDO Y APAGADO DE SABRINABOT
      if (text.startsWith("!sa ") || text === "!sa") {
        const opcion = text.split(" ")[1]?.toLowerCase();

        if (opcion === "i" || opcion === "info" || opcion === "estado") {
          const estadoTexto = botActivado
            ? "🟢 *ENCENDIDA (Online)*"
            : "🔴 *APAGADA (Offline)*";
          return responder(`ℹ️ *Estado actual de Sabrina:*\n${estadoTexto}`);
        }

        if (isGroup && !esAdmin && !msg.key.fromMe) {
          return responder(
            "❌ Solo los administradores pueden encender o apagar el bot.",
          );
        }

        if (opcion === "off" || opcion === "apagar") {
          if (!botActivado) return responder("💤 Sabrina ya está apagada.");
          botActivado = false;
          return responder("🔴 *Sabrina ha sido APAGADA.*");
        }

        if (opcion === "on" || opcion === "encender" || opcion === "activar") {
          if (botActivado) return responder("⚡ Sabrina ya está encendida.");
          botActivado = true;
          return responder("🟢 *Sabrina ha sido ENCENDIDA.*");
        }

        return responder(
          "⚠️ Usa:\n• `!sa on` - Encender el bot\n• `!sa off` - Apagar el bot\n• `!sa i` - Ver estado actual",
        );
      }

      if (!botActivado) {
        return;
      }

      // CONTROLADOR DE MENÚS Y SUBMENÚS
      const comandosMenu = [
        "!menu",
        "!menú",
        "!sm",
        "!am",
        "!dm",
        "!nm",
        "!em",
        "!help",
        "!cm",
        "!sam",
        "!jm",
        "!mo",
      ];

      if (comandosMenu.includes(cmdMenu)) {
        const chatId = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        let textoMenu = "";

        try {
          switch (cmdMenu) {
            case "!menu":
            case "!help":
            case "!menú":
              textoMenu =
                typeof getMainMenu === "function"
                  ? getMainMenu()
                  : "⚠️ Menú Principal no disponible.";
              break;
            case "!sm":
              textoMenu =
                typeof getStickersMenu === "function"
                  ? getStickersMenu()
                  : "⚠️ Menú Stickers no disponible.";
              break;
            case "!am":
              textoMenu =
                typeof getGrupoMenu === "function"
                  ? getGrupoMenu()
                  : "⚠️ Menú Grupo no disponible.";
              break;
            case "!dm":
              textoMenu =
                typeof getDescargasMenu === "function"
                  ? getDescargasMenu()
                  : "⚠️ Menú Descargas no disponible.";
              break;
            case "!nm":
              textoMenu =
                typeof getNsfwMenu === "function"
                  ? getNsfwMenu()
                  : "⚠️ Menú NSFW no disponible.";
              break;
            case "!em":
              textoMenu =
                typeof getAccionesMenu === "function"
                  ? getAccionesMenu()
                  : "⚠️ Menú Acciones no disponible.";
              break;
            case "!sam":
              textoMenu =
                typeof getSabrinamMenu === "function"
                  ? getSabrinamMenu()
                  : "⚠️ Menú Sabrina no disponible.";
              break;
            case "!jm":
              textoMenu =
                typeof getJuegosMenu === "function"
                  ? getJuegosMenu()
                  : "⚠️ Menú Juegos no disponible.";
              break;
            case "!cm":
              textoMenu =
                typeof getCasinoMenu === "function"
                  ? getCasinoMenu()
                  : "⚠️ Menú Casino no disponible.";
              break;
            case "!mo":
              textoMenu =
                typeof getModoMenu === "function"
                  ? getModoMenu()
                  : "⚠️ Menú Modo no disponible.";
              break;
          }
        } catch (errMenu) {
          console.error("❌ Error generando el texto del menú:", errMenu);
          textoMenu = "❌ Ocurrió un error al generar el menú.";
        }

        const esMenuPrincipal = ["!menu", "!help", "!menú"].includes(cmdMenu);

        await simularEscrituraHumana(chatId, "composing", 400);

        if (esMenuPrincipal) {
          const linkUrl = "https://instagram.com/shaanduy";
          let linkPreviewData = undefined;

          try {
            if (CACHE_MEDIA.sabrinaJpg) {
              const { imageMessage } = await prepareWAMessageMedia(
                { image: CACHE_MEDIA.sabrinaJpg },
                {
                  upload: sock.waUploadToServer,
                  mediaTypeOverride: "thumbnail-link",
                },
              );

              linkPreviewData = {
                "canonical-url": linkUrl,
                "matched-text": linkUrl,
                title: "Sabrina 💋",
                description: "by shan",
                jpegThumbnail: CACHE_MEDIA.sabrinaJpg,
                highQualityThumbnail: imageMessage || undefined,
              };
            }
          } catch (e) {
            console.error("⚠️ Error procesando imagen del menú:", e.message);
          }

          const contextInfo = {
            mentionedJid: [senderJid],
            isForwarded: false,
          };

          try {
            await sock.sendMessage(
              chatId,
              {
                text: textoMenu,
                linkPreview: linkPreviewData,
                contextInfo: contextInfo,
              },
              { quoted: msg },
            );
          } catch (errSend) {
            await sock.sendMessage(
              chatId,
              { text: textoMenu },
              { quoted: msg },
            );
          }
        } else {
          await sock.sendMessage(chatId, { text: textoMenu }, { quoted: msg });
        }
      }

      // COMANDOS DE STICKERS
      if (
        text === "!s" ||
        text.startsWith("!s ") ||
        text.startsWith("!sticker")
      ) {
        try {
          let rawTarget = null;

          if (
            msg.message?.imageMessage ||
            msg.message?.videoMessage ||
            msg.message?.viewOnceMessage ||
            msg.message?.viewOnceMessageV2 ||
            msg.message?.viewOnceMessageV2Extension
          ) {
            rawTarget = msg.message;
          } else if (
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
          ) {
            rawTarget =
              msg.message.extendedTextMessage.contextInfo.quotedMessage;
          }

          let mediaMessage = rawTarget;
          if (rawTarget?.viewOnceMessage?.message) {
            mediaMessage = rawTarget.viewOnceMessage.message;
          } else if (rawTarget?.viewOnceMessageV2?.message) {
            mediaMessage = rawTarget.viewOnceMessageV2.message;
          } else if (rawTarget?.viewOnceMessageV2Extension?.message) {
            mediaMessage = rawTarget.viewOnceMessageV2Extension.message;
          }

          // Validar si realmente hay un archivo multimedia antes de continuar
          if (
            !mediaMessage ||
            (!mediaMessage.imageMessage && !mediaMessage.videoMessage)
          ) {
            return await sock.sendMessage(
              from,
              { text: "⚠️ Envía o responde a una imagen/video usando el comando\n*!s*" },
              { quoted: msg }
            );
          }

          await simularEscrituraHumana(from, "composing", 300);
          const isAnimated = !!mediaMessage.videoMessage;

          const mediaBuffer = await descargarMedia(mediaMessage);

          const argsText = text.replace(/^!sticker|^!s\s*/i, "").trim();
          const [customPack, customAuthor] = argsText.split("|").map((s) => s.trim());

          const packName = customPack || "Sabrina 💋";
          const authorName = customAuthor || "by shan";

          const tmpInput = path.join(__dirname, `tmp_in_${Date.now()}.${isAnimated ? 'mp4' : 'png'}`);
          const tmpOutput = path.join(__dirname, `tmp_out_${Date.now()}.webp`);

          fs.writeFileSync(tmpInput, mediaBuffer);

          // Convertir a WebP con fondo transparente (pad=512:512... color=0x00000000@0)
          await new Promise((resolve, reject) => {
            let ffmpegCmd = ffmpeg(tmpInput);

            if (isAnimated) {
              ffmpegCmd.outputOptions([
                "-vcodec libwebp",
                "-vf scale=512:512:force_original_aspect_ratio=decrease,fps=10,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
                "-pix_fmt yuva420p",
                "-loop 0",
                "-preset default",
                "-an",
                "-vsync 0"
              ]);
            } else {
              ffmpegCmd.outputOptions([
                "-vcodec libwebp",
                "-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
                "-pix_fmt yuva420p"
              ]);
            }

            ffmpegCmd
              .toFormat("webp")
              .save(tmpOutput)
              .on("end", resolve)
              .on("error", reject);
          });

          // Inyectar metadatos (Pack y Autor) con node-webpmux
          const webp = require("node-webpmux");
          const img = new webp.Image();
          await img.load(tmpOutput);

          const jsonMetadata = {
            "sticker-pack-id": "sabrina-bot",
            "sticker-pack-name": packName,
            "sticker-pack-publisher": authorName,
            "emojis": ["💋"]
          };

          const exifHeader = Buffer.from([
            0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
            0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x16, 0x00, 0x00, 0x00
          ]);

          const jsonBuffer = Buffer.from(JSON.stringify(jsonMetadata), "utf8");
          const exifData = Buffer.concat([exifHeader, jsonBuffer]);
          exifData.writeUInt32LE(jsonBuffer.length, 14);

          img.exif = exifData;
          const stickerBuffer = await img.save(null);

          // Limpieza de archivos temporales
          if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
          if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);

          await sock.sendMessage(
            from,
            { sticker: stickerBuffer },
            { quoted: msg }
          );
        } catch (error) {
          console.error("❌ Error en sticker:", error.message || error);
          if (typeof borrarTemporalesOcultos === "function") borrarTemporalesOcultos();
        }
      }

      // COMANDO TOIMG
      if (text === "!to" || text.startsWith("!toimg")) {
        try {
          let quoted =
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

          if (!quoted) {
            return responder(
              "⚠️ Debes responder a un *sticker*, *foto* o *video* de una sola vista con `!to`.",
            );
          }

          if (quoted.viewOnceMessageV2?.message) {
            quoted = quoted.viewOnceMessageV2.message;
          } else if (quoted.viewOnceMessage?.message) {
            quoted = quoted.viewOnceMessage.message;
          } else if (quoted.viewOnceMessageV2Extension?.message) {
            quoted = quoted.viewOnceMessageV2Extension.message;
          }

          const esSticker = quoted.stickerMessage;
          const esFoto = quoted.imageMessage;
          const esVideo = quoted.videoMessage;

          if (!esSticker && !esFoto && !esVideo) {
            return responder(
              "⚠️ Debes responder a un *sticker estático*, o a una *foto/video de una sola vista*.",
            );
          }

          if (esSticker && esSticker.isAnimated) {
            return responder(
              "⚠️ El comando solo admite stickers estáticos, o fotos/videos de una sola vista.",
            );
          }

          const mediaBuffer = await descargarMedia(quoted);
          await simularEscrituraHumana(from, "composing", 400);

          if (esVideo) {
            await sock.sendMessage(
              from,
              {
                video: mediaBuffer,
                caption: "*Aquí tienes tu video.*",
                mimetype: "video/mp4",
              },
              { quoted: msg },
            );
          } else {
            await sock.sendMessage(
              from,
              {
                image: mediaBuffer,
                caption: "*Aquí tienes tu imagen.*",
              },
              { quoted: msg },
            );
          }
        } catch (error) {
          console.error("❌ Error en !toimg:", error.message || error);
          await responder("❌ Ocurrió un error al procesar el archivo.");
        }
      }

      // COMANDOS DE ADMINISTRACIÓN DE GRUPOS
      if (text === "!test") {
        await responder("¡Sabrina está escuchando este chat! ✅");
      }

      if (
        (comando === "!k" || comando === "!kick" || comando === "!dick") &&
        isGroup
      ) {
        try {
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          let rawTarget = ctx?.participant || ctx?.mentionedJid?.[0];

          if (!rawTarget) {
            return responder(
              "⚠️ Por favor, etiqueta a alguien o responde a su mensaje.",
            );
          }

          const targetNum = rawTarget
            .split("@")[0]
            .split(":")[0]
            .replace(/\D/g, "");
          const botJid = sock.user?.id || "";
          const numBot = botJid.split("@")[0].split(":")[0].replace(/\D/g, "");
          const lidBot = sock.user?.lid
            ? sock.user.lid.split("@")[0].split(":")[0].replace(/\D/g, "")
            : "";

          if (targetNum === numBot || (lidBot && targetNum === lidBot)) {
            if (CACHE_MEDIA.noKickWebp) {
              await simularEscrituraHumana(from, "composing", 300);
              await sock.sendMessage(
                from,
                { sticker: CACHE_MEDIA.noKickWebp },
                { quoted: msg },
              );
            } else {
              await responder("❌ ¡No me puedes expulsar a mí!");
            }
            return;
          }

          if (!esAdmin && !msg.key.fromMe) {
            return responder(
              "❌ No tienes permisos de administrador para usar este comando.",
            );
          }

          if (!isBotAdmin) {
            return responder("❌ Sabrina no tiene rol de administradora.");
          }

          const groupMetadata = await sock.groupMetadata(from);
          const participants = groupMetadata?.participants || [];

          const actualParticipant = participants.find((p) => {
            const pNum = p.id.split("@")[0].split(":")[0].replace(/\D/g, "");
            return pNum === targetNum || p.id === rawTarget;
          });

          if (!actualParticipant) {
            return responder(
              "⚠️ No se encontró a ese usuario en la lista de integrantes del grupo.",
            );
          }

          const userToKick = actualParticipant.id;

          if (
            actualParticipant.admin === "admin" ||
            actualParticipant.admin === "superadmin"
          ) {
            return responder(
              "❌ No puedo expulsar a otro administrador del grupo.",
            );
          }

          const mensajeDespedida = await responder(
            `Chao del grupo @${targetNum}`,
            {
              mentions: [userToKick],
            },
          );

          if (CACHE_MEDIA.audioBaneado) {
            await simularEscrituraHumana(from, "recording", 400);
            await sock.sendMessage(
              from,
              { audio: CACHE_MEDIA.audioBaneado, ptt: true, mimetype: "audio/mp4" },
              { quoted: mensajeDespedida },
            );
          }

          setTimeout(async () => {
            try {
              await sock.groupParticipantsUpdate(from, [userToKick], "remove");
            } catch (err) {
              console.error("Error al remover participante:", err);
            }
          }, 1000);
        } catch (error) {
          console.error("Error en Kick:", error);
        }
      }

      if (
        (text.startsWith("!todos") || text.startsWith("!mencionar")) &&
        isGroup
      ) {
        try {
          if (!esAdmin && !msg.key.fromMe) {
            return await responder(
              "❌ Necesitas ser administrador para usar este comando.",
            );
          }

          const groupMetadata = await sock.groupMetadata(from);

          const mensajeExtra = text.slice(text.indexOf(" ") + 1).trim();
          const tieneTextoExtra = text.includes(" ") && mensajeExtra.length > 0;

          let response = `📢 *¡Atención a todos!* ${tieneTextoExtra ? `\n\n📝 *Mensaje:* ${mensajeExtra}` : ""}\n\n`;
          let mentions = [];

          for (let participant of groupMetadata.participants) {
            mentions.push(participant.id);
            response += `@${participant.id.split("@")[0]}\n`;
          }

          await responder(response, { mentions: mentions });
        } catch (error) {
          console.error("Error en !todos:", error);
          await responder("❌ Hubo un problema al mencionar a todos.");
        }
      }

      if ((text === "!cerrar" || text === "!abrir") && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe) {
            return await responder(
              "❌ Necesitas ser administrador para usar este comando."
            );
          }

          if (!isBotAdmin) {
            return await responder("❌ Sabrina no tiene rol de administradora.");
          }

          const groupMetadata = await sock.groupMetadata(from);
          const estaCerrado = groupMetadata.announce;

          if (text === "!cerrar") {
            if (estaCerrado) {
              return await responder("⚠️ El grupo *ya está cerrado*.");
            }
            await sock.groupSettingUpdate(from, "announcement");
            return await responder("🔒 *El grupo ha sido CERRADO.*");
          }

          if (text === "!abrir") {
            if (!estaCerrado) {
              return await responder("⚠️ El grupo *ya está abierto*.");
            }
            await sock.groupSettingUpdate(from, "not_announcement");
            return await responder("🔓 *El grupo ha sido ABIERTO.*");
          }
        } catch (e) {
          console.error(`Error en ${text}:`, e);
          await responder(
            "❌ Ocurrió un error al intentar cambiar la configuración del grupo."
          );
        }
      }

      if (
        (text.startsWith("!promover") || text.startsWith("!admin")) &&
        isGroup
      ) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder(
              "❌ Necesitas ser administrador para usar este comando.",
            );

          let userToPromote =
            msg.message.extendedTextMessage?.contextInfo?.participant ||
            msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

          if (!userToPromote)
            return responder(
              "⚠️ Por favor, menciona a alguien o responde a su mensaje para darle admin.",
            );

          await sock.groupParticipantsUpdate(from, [userToPromote], "promote");
          await responder(
            `👑 @${userToPromote.split("@")[0]} ahora es **Administrador** del grupo.`,
            { mentions: [userToPromote] },
          );
        } catch (e) {
          console.error("Error en !promover:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if (
        (text.startsWith("!degradar") || text.startsWith("!qadmin")) &&
        isGroup
      ) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder(
              "❌ Necesitas ser administrador para usar este comando.",
            );

          let userToDemote =
            msg.message.extendedTextMessage?.contextInfo?.participant ||
            msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

          if (!userToDemote)
            return responder(
              "⚠️ Por favor, menciona a alguien o responde a su mensaje para quitarle admin.",
            );

          await sock.groupParticipantsUpdate(from, [userToDemote], "demote");
          await responder(
            `🪖 @${userToDemote.split("@")[0]} ya no es administrador.`,
            { mentions: [userToDemote] },
          );
        } catch (e) {
          console.error("Error en !degradar:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if ((comando === "!fg" || comando === "!fotogrupo") && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe) {
            return responder(
              "❌ No tienes permisos de administrador para cambiar la foto del grupo.",
            );
          }

          if (!isBotAdmin) {
            return responder("❌ Sabrina no tiene rol de administradora.");
          }

          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const isImage = msg.message?.imageMessage;
          const quotedMsg = ctx?.quotedMessage;
          const isQuotedImage = quotedMsg?.imageMessage;

          if (!isImage && !isQuotedImage) {
            return responder(
              "⚠️ Debes responder a una imagen o enviar una foto junto con el comando `!fg`.",
            );
          }

          await responder("⏳ Actualizando la foto del grupo...");

          const targetMedia = isImage ? msg.message : quotedMsg;
          const imageBuffer = await descargarMedia(targetMedia);

          await sock.updateProfilePicture(from, imageBuffer);

          return responder(
            "✅ ¡La foto de perfil del grupo ha sido actualizada correctamente!",
          );
        } catch (error) {
          console.error("❌ Error al actualizar la foto del grupo:", error);
          return responder(
            "❌ Ocurrió un error al intentar cambiar la foto del grupo. Asegúrate de que el archivo sea una imagen válida.",
          );
        }
      }

      if (text.startsWith("!nombre ") && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder("❌ Solo administradores.");
          const nuevoNombre = body.slice(8).trim();
          if (!nuevoNombre)
            return responder(
              "⚠️ Escribe el nuevo nombre. Ejemplo: *!nombre Grupo Oficial*",
            );

          await sock.groupUpdateSubject(from, nuevoNombre);
          await responder(`✅ Nombre del grupo cambiado a: *${nuevoNombre}*`);
        } catch (e) {
          console.error("Error en !nombre:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if (text.startsWith("!desc ") && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder("❌ Solo administradores.");
          const nuevaDesc = body.slice(6).trim();
          if (!nuevaDesc)
            return responder(
              "⚠️ Escribe la nueva descripción. Ejemplo: *!desc Reglas: No spam.*",
            );

          await sock.groupUpdateDescription(from, nuevaDesc);
          await responder("✅ Descripción del grupo actualizada con éxito.");
        } catch (e) {
          console.error("Error en !desc:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if ((text === "!link" || text === "!enlace") && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder("❌ Solo administradores.");
          const code = await sock.groupInviteCode(from);
          await responder(
            `🔗 *Enlace de invitación al grupo:*\nhttps://chat.whatsapp.com/${code}`,
          );
        } catch (e) {
          console.error("Error en !link:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if (text === "!reiniciar" && isGroup) {
        try {
          if (!esAdmin && !msg.key.fromMe)
            return responder("❌ Solo administradores.");
          await sock.groupRevokeInvite(from);
          const newCode = await sock.groupInviteCode(from);
          await responder(
            `🔄 *Enlace restablecido exitosamente.*\nNuevo enlace:\nhttps://chat.whatsapp.com/${newCode}`,
          );
        } catch (e) {
          console.error("Error en !reiniciar:", e);
          await responder("❌ Sabrina no tiene rol de administradora.");
        }
      }

      if (text.startsWith("!antilink")) {
        if (!isGroup) {
          return responder("⚠️ Este comando solo se puede usar en grupos.");
        }

        if (!esAdmin && !msg.key.fromMe) {
          return responder(
            "❌ Solo los *administradores* del grupo pueden configurar el Anti-Link.",
          );
        }

        try {
          if (!isBotAdmin) {
            return await responder(
              "❌ Sabrina no tiene rol de administradora.",
            );
          }

          const opcion = text.split(" ")[1]?.toLowerCase();

          if (opcion === "on" || opcion === "activar") {
            antilinkActivado = true;
            return responder("🛡️ *Anti-Link ACTIVADO.*");
          } else if (opcion === "off" || opcion === "desactivar") {
            antilinkActivado = false;
            return responder("🔓 *Anti-Link DESACTIVADO.*");
          } else {
            return responder(
              "⚠️ Uso correcto: `!antilink on` o `!antilink off`",
            );
          }
        } catch (e) {
          console.error("Error en !antilink:", e);
          return responder(
            "❌ Hubo un fallo al consultar los permisos del grupo.",
          );
        }
      }

      if (isGroup && antilinkActivado) {
        const rawText =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          "";

        const socialLinkRegex =
          /(chat\.whatsapp\.com|wa\.me|whatsapp\.com|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|t\.me|telegram\.me|youtube\.com|youtu\.be|x\.com|twitter\.com|discord\.gg|discord\.com\/invite)/i;

        if (socialLinkRegex.test(rawText)) {
          if (!esAdmin) {
            try {
              if (isBotAdmin) {
                await sock.sendMessage(from, { delete: msg.key });

                const userTag = `@${sender.split("@")[0]}`;
                await responder(`⚠️ ${userTag}, los enlaces a redes sociales no están permitidos en este grupo. Tu mensaje ha sido eliminado.`, { mentions: [sender] });
              }
            } catch (e) {
              console.error("Error en detección de Anti-Link:", e);
            }
          }
        }
      }

      // COMANDO !modoadmin (ON / OFF)
      if (comando === "!ma") {
        if (!isGroup)
          return responder("❌ Este comando solo se puede usar en grupos.");
        if (!esAdmin)
          return responder(
            "❌ Solo los administradores pueden cambiar esta configuración.",
          );

        const subcomando = text.split(/\s+/)[1];

        if (subcomando === "on" || subcomando === "activar") {
          if (modoSoloAdmins.has(from)) {
            return responder(
              "⚠️ El modo Solo Admins ya está *ACTIVADO* en este grupo.",
            );
          }
          modoSoloAdmins.add(from);
          return responder(
            "🔒 *Modo Solo Admins ACTIVADO.*",
          );
        }

        if (subcomando === "off" || subcomando === "desactivar") {
          if (!modoSoloAdmins.has(from)) {
            return responder(
              "⚠️ El modo Solo Admins ya está *DESACTIVADO* en este grupo.",
            );
          }
          modoSoloAdmins.delete(from);
          return responder(
            "🔓 *Modo Solo Admins DESACTIVADO.*",
          );
        }

        return responder(
          "❓ *Uso del comando:*\n• `!ma on` - Restringe el bot solo para admins.\n• `!ma off` - Permite el uso a todos los miembros.",
        );
      }

      if (isGroup && modoSoloAdmins.has(from) && !esAdmin) {
        return;
      }

      // COMANDOS DE MUTE Y UNMUTE
      if (text.startsWith("!mute") || text.startsWith("!silenciar")) {
        if (!isGroup)
          return responder("❌ Este comando solo funciona en grupos.");
        if (!esAdmin && !msg.key.fromMe)
          return responder(
            "❌ Solo los *administradores* pueden usar este comando.",
          );

        try {
          if (!isBotAdmin) {
            return await responder(
              "❌ Sabrina no tiene rol de administradora.",
            );
          }

          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const quotedJid = ctx?.participant;
          const mentionedJids = ctx?.mentionedJid;
          const targetJid =
            mentionedJids && mentionedJids.length > 0
              ? mentionedJids[0]
              : quotedJid;

          if (!targetJid) {
            return responder(
              "❌ Debes *responder a un mensaje* o *etiquetar (@)* al usuario que deseas silenciar.",
            );
          }

          if (!mutedUsers[from]) mutedUsers[from] = [];

          const numMute = targetJid.replace(/\D/g, "");

          const yaSilenciado = mutedUsers[from].some(
            (jid) =>
              typeof jid === "string" && jid.replace(/\D/g, "") === numMute,
          );

          if (yaSilenciado) {
            return responder(
              "⚠️ Este usuario ya está silenciado en este grupo.",
            );
          }

          mutedUsers[from].push(targetJid);

          await responder(`🤫 @${numMute} ha sido *silenciado*. Sus mensajes serán eliminados automáticamente.`, { mentions: [targetJid] });
        } catch (e) {
          console.error("Error en !mute:", e);
          await responder("❌ Hubo un error al ejecutar el comando.");
        }
        return;
      }

      if (text.startsWith("!unmute") || text.startsWith("!desmutear")) {
        if (!isGroup)
          return responder("❌ Este comando solo funciona en grupos.");
        if (!esAdmin && !msg.key.fromMe)
          return responder(
            "❌ Solo los *administradores* pueden usar este comando.",
          );

        try {
          if (!isBotAdmin) {
            return await responder(
              "❌ Sabrina no tiene rol de administradora.",
            );
          }

          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const quotedJid = ctx?.participant;
          const mentionedJids = ctx?.mentionedJid;
          const targetJid =
            mentionedJids && mentionedJids.length > 0
              ? mentionedJids[0]
              : quotedJid;

          if (!targetJid) {
            return responder(
              "❌ Debes *responder a un mensaje* o *etiquetar (@)* al usuario que deseas desmutear.",
            );
          }

          if (
            !mutedUsers[from] ||
            !Array.isArray(mutedUsers[from]) ||
            mutedUsers[from].length === 0
          ) {
            return responder("⚠️ No hay usuarios silenciados en este grupo.");
          }

          const numTarget = targetJid.replace(/\D/g, "");

          const existe = mutedUsers[from].some(
            (jid) =>
              typeof jid === "string" && jid.replace(/\D/g, "") === numTarget,
          );

          if (!existe) {
            return responder("⚠️ Este usuario no está silenciado.");
          }

          mutedUsers[from] = mutedUsers[from].filter(
            (jid) =>
              typeof jid === "string" && jid.replace(/\D/g, "") !== numTarget,
          );

          await responder(`🔊 @${numTarget} ya no está silenciado. Puede volver a hablar.`, { mentions: [targetJid] });
        } catch (e) {
          console.error("Error en !unmute:", e);
          await responder("❌ Hubo un error al ejecutar el comando.");
        }
        return;
      }

      // COMANDOS DE MP3
if (text.startsWith("!mp3")) {
        const query = body.slice(4).trim();

        if (!query) {
          return responder(
            "❌ Usa: *!mp3 [link o nombre]*\nEjemplo:\n*!mp3 Baby im back - The kid LAROI*",
          );
        }

        try {
          let videoUrl = query;
          let videoTitle = "";

          if (!query.startsWith("http://") && !query.startsWith("https://")) {
            const searchResult = await yts(query);

            if (!searchResult.videos.length) {
              return responder("❌ No se encontraron resultados en YouTube.");
            }

            videoUrl = searchResult.videos[0].url;
            videoTitle = searchResult.videos[0].title;
          } else {
            const searchResult = await yts(query);
            videoTitle =
              searchResult && searchResult.videos.length
                ? searchResult.videos[0].title
                : "Audio descargado";
          }

          await responder(`🔍 Buscando: *${videoTitle}*...`);

          const apiKey = "lem_9a1f7fa371059d0ac1c4d61228a9038b1f1707d9";
          const res = await axios.get(
            `https://api.lempi.lat/dl/yta?apikey=${apiKey}&url=${encodeURIComponent(videoUrl)}`,
          );

          const downloadUrl =
            res.data?.datos?.url ||
            res.data?.result?.download?.url ||
            res.data?.url;
          const title = res.data?.titulo || videoTitle;

          if (!downloadUrl) {
            console.error("Respuesta inesperada de Lempi:", res.data);
            return responder(
              "❌ La API no devolvió un enlace de audio válido.",
            );
          }

          await responder(`🎶 *Canción:* ${title}`);

          await simularEscrituraHumana(from, "composing", 400);
          await sock.sendMessage(
            from,
            {
              audio: { url: downloadUrl },
              mimetype: "audio/mp4",
              fileName: `${title}.mp3`,
              ptt: false,
            },
            { quoted: msg },
          );

        } catch (e) {
          console.error(
            "❌ [ERROR Lempi API]:",
            e.response?.data || e.message || e,
          );
          responder("❌ Ocurrió un error al procesar la descarga.");
        }
      }

      // CONTROL DE ACTIVACIÓN DE JUEGOS
      if (text.startsWith("!juegos") || text.startsWith("!juego")) {
        if (isGroup) {
          if (!esAdmin && !msg.key.fromMe) {
            return responder(
              "❌ Solo los administradores pueden activar o desactivar los juegos.",
            );
          }
        }

        const opcion = text.split(" ")[1]?.toLowerCase();

        if (opcion === "on" || opcion === "activar") {
          juegosActivados = true;
          return responder("🕹️ *Comandos de juegos ACTIVADOS.*");
        } else if (opcion === "off" || opcion === "desactivar") {
          juegosActivados = false;
          return responder("🔇 *Comandos de juegos DESACTIVADOS.*");
        } else {
          const estado = juegosActivados ? "ACTIVADOS 🟢" : "DESACTIVADOS 🔴";
          return responder(
            `ℹ️ Estado de los juegos: *${estado}*\nUsa: \`!juegos on\` o \`!juegos off\``,
          );
        }
      }

      // COMANDOS DE JUEGOS
      const cmdJuego = text.trim().split(/\s+/)[0].toLowerCase();

      if (
        [
          "!peruano",
          "!gay",
          "!racista",
          "!pija",
          "!down",
          "!topgay",
          "!tope",
        ].includes(cmdJuego)
      ) {
        if (!juegosActivados) {
          return responder("⚠️ Los juegos están desactivados");
        }

        const contextInfo =
          msg.message?.extendedTextMessage?.contextInfo ||
          msg.message?.imageMessage?.contextInfo ||
          msg.message?.videoMessage?.contextInfo ||
          {};

        let targetJid =
          contextInfo.participant ||
          contextInfo.mentionedJid?.[0] ||
          msg.key.participant ||
          msg.key.remoteJid;
        let targetTag = `@${targetJid.split("@")[0]}`;

        const porcentaje = Math.floor(Math.random() * 101);
        let respuestaText = "";

        switch (cmdJuego) {
          case "!peruano":
            respuestaText = `🇵🇪 *MEDIDOR DE PERUANIDAD* 🇵🇪\n\n👤 Usuario: ${targetTag}\n📊 Nivel de peruano: *${porcentaje}%*`;
            if (porcentaje > 80)
              respuestaText += "\nQue rico el motesito papai";
            else if (porcentaje > 40)
              respuestaText += "\nVamos por un caldito de mote?";
            else respuestaText += "\nAre u peruana? Never 🤮";
            break;

          case "!gay":
            respuestaText = `🏳️‍🌈 *MEDIDOR DE GAY* 🏳️‍🌈\n\n👤 Usuario: ${targetTag}\n📊 Nivel de gay: *${porcentaje}%*`;
            if (porcentaje > 80) respuestaText += "\nBasta chicos no soy gay.";
            else if (porcentaje > 40)
              respuestaText += "\nSi ves una pija te hace dudar.";
            else respuestaText += "\nOpa te salvaste";
            break;

          case "!racista":
            respuestaText = `🇮🇱 *MEDIDOR DE RACISMO* 🇮🇱\n\n👤 Usuario: ${targetTag}\n📊 Nivel de racismo: *${porcentaje}%*`;
            if (porcentaje > 80)
              respuestaText += "\nUsuario promedio de instagram.";
            else if (porcentaje > 40)
              respuestaText += "\nAgente secreto de Tel Aviv 🇮🇱";
            else respuestaText += "\nQue sos? Normal / Peruano";
            break;

          case "!down":
            respuestaText = `🤪 *MEDIDOR DE DOWN* 🤪\n\n👤 Usuario: ${targetTag}\n📊 Nivel de down: *${porcentaje}%*`;
            if (porcentaje > 80)
              respuestaText += "\nEu ato quiero un bajita ato dale.";
            else if (porcentaje > 40)
              respuestaText += "\nUsas xd en cada mensaje.";
            else respuestaText += "\nBautista";
            break;

          case "!pija":
            const medida = Math.floor(Math.random() * 28) + 1;
            respuestaText = `🍆 *MEDIDOR DE BIJA* 🍆\n\n👤 Usuario: ${targetTag}\n📏 Tamaño: *${medida} cm*`;
            if (medida > 20) respuestaText += "\nNormal";
            else if (medida > 12) respuestaText += "\nPasable";
            else if (medida > 5) respuestaText += "\nDemasido grande amigo";
            else respuestaText += "\nUsuario promedio de discord.";
            break;

          case "!topgay":
            if (!isGroup) {
              respuestaText = "❌ Este comando solo funciona en grupos.";
              break;
            }

            try {
              const groupMetadata = await sock.groupMetadata(from);
              const participants = groupMetadata.participants;

              if (participants.length < 5) {
                await responder("❌ Se necesitan al menos 5 personas en el grupo.");
                return;
              }

              const shuffled = [...participants]
                .sort(() => 0.5 - Math.random())
                .slice(0, 5);

              const medallas = ["🥇", "🥈", "🥉", "🏅", "🎖️"];
              const porcentajes = [100, 85, 70, 55, 40];

              let textoTop = `🌈 *TOP 5 MÁS GAYS DEL GRUPO* 🌈\n\n`;
              let mencionesArray = [];

              shuffled.forEach((user, index) => {
                const jid = user.id.includes("@s.whatsapp.net")
                  ? user.id
                  : user.jid || user.id;
                const numero = jid.split("@")[0];

                mencionesArray.push(jid);
                textoTop += `${medallas[index]} *Top ${index + 1}:* @${numero} - *${porcentajes[index]}%*\n`;
              });

              textoTop += `\nGuarden sus penes.`;

              await responder(textoTop, { mentions: mencionesArray });
              return;
            } catch (e) {
              console.error("❌ Error en !topgay:", e);
              await responder("❌ Error al obtener la lista del grupo.");
              return;
            }

          case "!tope":
            if (!isGroup) {
              respuestaText = "❌ Este comando solo funciona en grupos.";
              break;
            }

            try {
              const groupMetadata = await sock.groupMetadata(from);
              const participants = groupMetadata.participants;

              if (participants.length < 5) {
                await responder("❌ Se necesitan al menos 5 personas en el grupo.");
                return;
              }

              const shuffled = [...participants]
                .sort(() => 0.5 - Math.random())
                .slice(0, 5);

              const medallas = ["🥇", "🥈", "🥉", "🏅", "🎖️"];
              const porcentajes = [100, 85, 70, 55, 40];

              let textoTop = `🇵🇪 *TOP 5 MÁS PERUANOS DEL GRUPO* 🇵🇪\n\n`;
              let mencionesArray = [];

              shuffled.forEach((user, index) => {
                const jid = user.id.includes("@s.whatsapp.net")
                  ? user.id
                  : user.jid || user.id;
                const numero = jid.split("@")[0];

                mencionesArray.push(jid);
                textoTop += `${medallas[index]} *Top ${index + 1}:* @${numero} - *${porcentajes[index]}%*\n`;
              });

              textoTop += `\n¿Que rico el motesito papai o qué? 🍲`;

              await responder(textoTop, { mentions: mencionesArray });
              return;
            } catch (e) {
              console.error("❌ Error en !peruano:", e);
              await responder("❌ Error al obtener la lista del grupo.");
              return;
            }
        }

        await responder(respuestaText, { mentions: [targetJid] });
      }

      // JUEGO DEL CASINO
      if (text === "!cd") {
        if (!esAdmin && !msg.key.fromMe)
          return responder("❌ Solo administradores.");
        casinoActivo = false;
        return responder("🎰 El casino de Sabrina ha sido **DESACTIVADO** 🔴");
      }

      if (text === "!ca") {
        if (!esAdmin && !msg.key.fromMe)
          return responder("❌ Solo administradores.");
        casinoActivo = true;
        return responder("🎰 El casino de Sabrina ha sido **ACTIVADO** 🟢");
      }

      if (text === "!t" || text === "!w") {
        if (!casinoActivo) return responder("⚠️ El casino está desactivado.");

        let stats = getStats(sender);
        const now = Date.now();
        const cooldown = 3600000;

        if (now - stats.lastWork < cooldown) {
          const minutesLeft = Math.ceil(
            (cooldown - (now - stats.lastWork)) / 60000,
          );
          return responder(
            `⏳ Estás cansado. Vuelve a trabajar en ${minutesLeft} minutos.`,
          );
        }

        const ganancia = Math.floor(Math.random() * (200 - 50 + 1)) + 50;
        updateBalance(sender, ganancia);

        const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
        data[sender].lastWork = now;
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

        await responder(
          `💰 ¡Trabajaste duro y ganaste *$${ganancia}*! \nSaldo actual: *$${getStats(sender).balance}*`,
        );
      }

      if (text === "!bal") {
        const stats = getStats(sender);
        const numero = sender.split("@")[0];
        await responder(
          `🏦 *BANCO SABRINA*\n\n💰 Saldo de: @${numero}\n💵 Total: *$${stats.balance}*`,
          { mentions: [sender] },
        );
      }

      if (text.startsWith("!r ")) {
        if (!isGroup)
          return responder("❌ Este comando solo funciona en grupos.");
        if (!casinoActivo) return responder("⚠️ El casino está desactivado.");

        const args = text.split(" ");
        const eleccion = args[1];
        const inputApuesta = args[2];
        const stats = getStats(sender);

        const coloresValidos = ["rojo", "negro", "verde"];
        if (!coloresValidos.includes(eleccion) || !inputApuesta) {
          return responder(
            "Uso: *!r rojo 50* o *!r rojo todo* (Colores: rojo, negro, verde)",
          );
        }

        let apuesta =
          inputApuesta === "todo" || inputApuesta === "all"
            ? stats.balance
            : parseInt(inputApuesta);

        if (isNaN(apuesta) || apuesta <= 0)
          return responder("❌ Ingresa una cantidad válida o escribe *todo*.");
        if (stats.balance < apuesta)
          return responder(
            `❌ No tienes suficiente dinero. Saldo actual: *$${stats.balance}*`,
          );

        const resultadoNum = Math.floor(Math.random() * 37);
        let resultadoColor =
          resultadoNum === 0
            ? "verde"
            : resultadoNum % 2 === 0
              ? "negro"
              : "rojo";

        let mensaje = `🎰 La ruleta gira y cae en: *${resultadoNum} (${resultadoColor.toUpperCase()})*\n`;

        if (eleccion === resultadoColor) {
          let premio = resultadoColor === "verde" ? apuesta * 19 : apuesta;
          updateBalance(sender, premio);
          mensaje += `\n🎉 ¡GANASTE! Recibes *$${premio}*.`;
        } else {
          updateBalance(sender, -apuesta);
          mensaje += `\n💸 Perdiste *$${apuesta}*. ¡Suerte la próxima!`;
        }

        await responder(mensaje);
      }

      // ACCIONES EN GRUPOS
      if (text.startsWith("!emotes")) {
        if (isGroup && !esAdmin && !msg.key.fromMe) {
          return responder(
            "⚠️ Solo los administradores pueden activar o desactivar los emotes.",
          );
        }

        const opcion = text.split(" ")[1]?.toLowerCase();

        if (opcion === "on" || opcion === "activar") {
          accionesActivadas = true;
          return responder("✅ Los comandos de emotes han sido *ACTIVADOS*");
        } else if (opcion === "off" || opcion === "desactivar") {
          accionesActivadas = false;
          return responder("❌ Los emotes han sido *DESACTIVADOS*");
        } else {
          return responder(
            "⚠️ Usa: `!emotes on` para activar o `!emotes off` para desactivar.",
          );
        }
      }

      if (text.startsWith("!")) {
        const commandWord = text.trim().split(/\s+/)[0].slice(1).toLowerCase();

        if (accionesMap[commandWord]) {
          if (!accionesActivadas) {
            return responder(
              "⚠️ Los comandos de emote están desactivados actualmente en este bot.",
            );
          }

          const senderJid = msg.key.participant || msg.key.remoteJid;
          const senderNum = senderJid
            .split("@")[0]
            .split(":")[0]
            .replace(/\D/g, "");
          const senderTag = `@${senderNum}`;

          const accionesSolo = ["paja", "dormir", "bailar", "venirse"];
          const esAccionSolo = accionesSolo.includes(accionesMap[commandWord]);

          let targetJid = null;
          let targetTag = "";
          let mentions = [senderJid];

          if (!esAccionSolo) {
            const contextInfo =
              msg.message?.extendedTextMessage?.contextInfo ||
              msg.message?.imageMessage?.contextInfo ||
              msg.message?.videoMessage?.contextInfo ||
              {};

            targetJid =
              contextInfo.participant || contextInfo.mentionedJid?.[0];

            if (!targetJid) {
              return responder(
                `⚠️ Debes responder al mensaje de alguien o etiquetarlo.\n\n*Ejemplo:* Responde a un mensaje con \`!${commandWord}\` o escribe \`!${commandWord} @usuario\``,
              );
            }

            const targetNum = targetJid
              .split("@")[0]
              .split(":")[0]
              .replace(/\D/g, "");

            if (senderNum === targetNum) {
              return responder(
                "⚠️ No puedes realizar esta acción sobre ti mismo.",
              );
            }

            targetTag = `@${targetNum}`;
            mentions.push(targetJid);
          }

          const accionNombre = accionesMap[commandWord];

          let fileName = `${accionNombre}.mp4`;
          if (!esAccionSolo) {
            const randomNum = Math.floor(Math.random() * 3) + 1;
            fileName = `${accionNombre}${randomNum}.mp4`;
          }

          const gifPath = path.join(__dirname, "archivos", "gifs", fileName);

          if (!fs.existsSync(gifPath)) {
            return responder(
              `❌ No se encontró el archivo de animación: \`${fileName}\` en la carpeta gifs.`,
            );
          }

          const mensajesTexto = {
            besar: `💋 ${senderTag} le dio un apasionado beso a ${targetTag}!`,
            follar: `🔥 ${senderTag} se folló intensamente a ${targetTag}!`,
            abrazo: `🤗 ${senderTag} le dio un abrazo a ${targetTag}!`,
            nalgada: `🍑 ${senderTag} le dio una nalgada a ${targetTag}!`,
            mear: `💦 ${senderTag} meo a ${targetTag}!`,
            cumear: `💦 ${senderTag} cumeo a ${targetTag}!`,
            footjob: `🦶 ${senderTag} le dio un footjob a ${targetTag}!`,
            boobjob: `🍑 ${senderTag} le dio un boobjob a ${targetTag}!`,
            balazo: `🔫 ${senderTag} le metió un plomazo a ${targetTag}!`,
            paja: `💦 ${senderTag} se está pajeando!`,
            bailar: `🪩 ${senderTag} se puso a bailar`,
            venirse: `💦 ${senderTag} se vino`,
            dormir: `😴 ${senderTag} se fue a dormir.`,
            anal: `🍆 ${senderTag} le hizo un anal a ${targetTag}!`,
            dedear: `👉 ${senderTag} dedeo a ${targetTag}!`,
          };

          const caption =
            mensajesTexto[accionNombre] ||
            `✨ ${senderTag} realizó ${accionNombre}!`;

          try {
            await simularEscrituraHumana(from, "composing", 400);
            await sock.sendMessage(
              from,
              {
                video: { url: gifPath },
                gifPlayback: true,
                caption: caption,
                mentions: mentions,
              },
              { quoted: msg },
            );
          } catch (error) {
            console.error("❌ Error al enviar el GIF de acción:", error);
            await responder("❌ Ocurrió un error al cargar la animación.");
          }
        }
      }

      // CONTROL NSFW
      if (text === "!sabrina activa sexo") {
        nsfwActivado = !nsfwActivado;
        const estado = nsfwActivado ? "ACTIVADO 🔥" : "DESACTIVADO ❄️";
        return responder(
          `👑 *[Modo Creador]* Modo NSFW cambiado a: *${estado}*`,
        );
      }

      if (text.startsWith("!nsfw")) {
        const args = body.trim().split(/ +/).slice(1);
        const accion = args[0] ? args[0].toLowerCase() : "";

        if (accion === "on" || accion === "activar") {
          if (!esAdmin && !msg.key.fromMe)
            return responder(
              "❌ Solo administradores pueden activar el modo NSFW.",
            );
          nsfwActivado = true;
          return responder("🔥 *Modo NSFW ACTIVADO*");
        } else if (accion === "off" || accion === "desactivar") {
          if (!esAdmin && !msg.key.fromMe)
            return responder(
              "❌ Solo administradores pueden desactivar el modo NSFW.",
            );
          nsfwActivado = false;
          return responder("❄️ *Modo NSFW DESACTIVADO*");
        } else if (!accion) {
          const estadoActual = nsfwActivado ? "ACTIVADO 🔥" : "DESACTIVADO ❄️";
          return responder(
            `ℹ️ Estado NSFW actual: *${estadoActual}*\nUsa: *!nsfw on* o *!nsfw off*`,
          );
        }
      }

      // COMANDOS NSFW
      if (
        [
          "!waifu",
          "!hentai",
          "!neko",
          "!pussy",
          "!feet",
          "!tetas",
          "!culos",
          "!amateur",
          "!rusa",
        ].includes(text)
      ) {
        if (!nsfwActivado) {
          return responder(
            "❄️ El modo NSFW está desactivado en este bot. Pídele a un admin que use *!nsfw on*",
          );
        }

        try {
          let type = "hneko";
          if (text === "!hentai") type = "hentai";
          if (text === "!tetas") type = "boobs";
          if (text === "!amateur") type = "gonewild";
          if (text === "!rusa") type = "paizuri";
          if (text === "!culos") type = "ass";
          if (text === "!waifu") type = "paizuri";
          if (text === "!neko") type = "hneko";
          if (text === "!pussy") type = "pussy";
          if (text === "!feet") type = "feet";

          const apiUrl = `https://nekobot.xyz/api/image?type=${type}`;

          const jsonBuffer = await downloadBuffer(apiUrl);
          const responseText = jsonBuffer.toString("utf-8").trim();

          let data;
          try {
            data = JSON.parse(responseText);
          } catch (e) {
            return responder(
              "❌ La API devolvió una respuesta no válida. Inténtalo de nuevo.",
            );
          }

          if (!data || !data.message || !data.success) {
            return responder(
              "❌ No se encontró ninguna imagen en este momento.",
            );
          }

          const imageUrl = data.message;
          const fileBuffer = await downloadBuffer(imageUrl);

          const frases = [
            "Que rico",
            "Que, que, queeee 👀",
            "Sale pajubi?",
            "Oaaaaaaa",
          ];
          const fraseAleatoria =
            frases[Math.floor(Math.random() * frases.length)];

          const urlLower = imageUrl.toLowerCase();
          const esVideo = urlLower.endsWith(".mp4");
          const esGif = urlLower.endsWith(".gif");

          await simularEscrituraHumana(from, "composing", 400);

          if (esVideo) {
            await sock.sendMessage(
              from,
              {
                video: fileBuffer,
                caption: fraseAleatoria,
                mimetype: "video/mp4",
              },
              { quoted: msg },
            );
          } else if (esGif) {
            await sock.sendMessage(
              from,
              {
                image: fileBuffer,
                caption: fraseAleatoria,
                mimetype: "image/gif",
              },
              { quoted: msg },
            );
          } else {
            await sock.sendMessage(
              from,
              {
                image: fileBuffer,
                caption: fraseAleatoria,
              },
              { quoted: msg },
            );
          }
        } catch (error) {
          console.error("❌ Error enviando contenido NSFW:", error.message);
          await responder(
            "❌ Ocurrió un error al obtener el archivo. Inténtalo de nuevo.",
          );
        }
      }

      // CONTROL DE AUDIOS DE VOZ
      if (text === "!sabrina protocolo") {
        audiosActivados = !audiosActivados;
        const estado = audiosActivados ? "ACTIVADOS 🔊" : "DESACTIVADOS 🔇";
        return responder(
          `👑 *[Modo Creador]* Estado de audios cambiado a: *${estado}*`,
        );
      }

      if (text.startsWith("!audios")) {
        if (!esAdmin && !msg.key.fromMe) {
          return responder(
            "❌ Necesitas ser administrador del grupo para cambiar esta opción.",
          );
        }

        const accion = body.slice(7).trim().toLowerCase();

        if (accion === "on" || accion === "activar") {
          audiosActivados = true;
          return responder("🔊 *Audios de voz automáticos ACTIVADOS.*");
        } else if (accion === "off" || accion === "desactivar") {
          audiosActivados = false;
          return responder("🔇 *Audios de voz automáticos DESACTIVADOS.*");
        } else {
          const estadoActual = audiosActivados
            ? "ACTIVADOS 🔊"
            : "DESACTIVADOS 🔇";
          return responder(
            `ℹ️ Estado de audios: *${estadoActual}*\nUsa: *!audios on* o *!audios off*`,
          );
        }
      }

     // Importa fluent-ffmpeg arriba en tu archivo si no lo tienes:
// const ffmpeg = require("fluent-ffmpeg");

      // RESPUESTA CON AUDIOS DE VOZ
      const sonidos = {
        'porno': 'ney.ogg',
        'peruano': 'gaspip.ogg',
        'boliviano': 'gaspib.ogg',
        ':v': 'viejo1.ogg',
        'god': 'sombare13.ogg',
        'good': 'sombare14.ogg',
        'vamoo': 'vamo.ogg',
        'pasen': 'maau2.ogg',
        'la nueva': 'mamut.ogg',
        'responde': 'hola.ogg',
        'respondeme': 'hola.ogg',
        'mil': 'mil.ogg',
        'fernan': 'fernan.ogg'
      };

      if (sonidos[text] && audiosActivados) {
        try {
          const nombreArchivo = sonidos[text];
          const audioPath = path.join(__dirname, "archivos", "mp3", nombreArchivo);

          if (fs.existsSync(audioPath)) {
            await simularEscrituraHumana(from, "recording", 400);

            // Crear ruta para el archivo temporal convertido a mono
            const tempPath = path.join(__dirname, "temp", `mono_${Date.now()}.ogg`);
            
            // Crear carpeta temp si no existe
            const tempDir = path.join(__dirname, "temp");
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            // Procesar audio: Convertir a MONO (1 canal), Opus, 48kHz
            await new Promise((resolve, reject) => {
              ffmpeg(audioPath)
                .toFormat("ogg")
                .audioCodec("libopus")
                .audioChannels(1) // 👈 FORZAR CANAL MONO
                .audioFrequency(48000)
                .addOutputOptions(["-avoid_negative_ts make_zero"])
                .on("end", resolve)
                .on("error", reject)
                .save(tempPath);
            });

            const audioBuffer = fs.readFileSync(tempPath);

            await sock.sendMessage(
              from,
              {
                audio: audioBuffer,
                ptt: true,
                mimetype: "audio/ogg; codecs=opus",
              },
              { quoted: msg }
            );

            // Limpiar archivo temporal
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

          } else {
            console.log(`⚠️ Archivo no encontrado: ${audioPath}`);
          }
        } catch (error) {
          console.error("❌ Error al procesar o enviar audio:", error.message);
        }
      }
    } catch (err) {
      console.error("❌ Error procesando mensaje:", err);
    }
  });
}

// INICIA EL BOT Y ACA TERMINA TODA LA PROGRAMACION NO BORRAR ESTA LINEA
iniciarBot();