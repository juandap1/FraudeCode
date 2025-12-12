const magenta = "\x1b[35m";
const green = "\x1b[32m";
const reset = "\x1b[0m";

function printGreenText(txt: string) {
  console.log(magenta + txt + reset);
}

const welcome = `${magenta}╭───────────────────────────────╮${reset}
${magenta}│ *${reset} Welcome to ${magenta}Fraude Code${reset}      ${magenta}│${reset}
${magenta}╰───────────────────────────────╯${reset}`;

const art = `
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║  ███████╗██████╗  █████╗ ██╗   ██╗██████╗ ███████╗                ║
║  ██╔════╝██╔══██╗██╔══██╗██║   ██║██╔══██╗██╔════╝                ║
║  █████╗  ██████╔╝███████║██║   ██║██║  ██║█████╗                  ║
║  ██╔══╝  ██╔══██╗██╔══██║██║   ██║██║  ██║██╔══╝                  ║
║  ██║     ██║  ██║██║  ██║╚██████╔╝██████╔╝███████╗                ║
║  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝                ║
║                                                                   ║
║   ██████╗ ██████╗ ██████╗ ███████╗                                ║
║  ██╔════╝██╔═══██╗██╔══██╗██╔════╝                                ║
║  ██║     ██║   ██║██║  ██║█████╗                                  ║
║  ██║     ██║   ██║██║  ██║██╔══╝                                  ║
║  ╚██████╗╚██████╔╝██████╔╝███████╗                                ║
║   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝                                ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`;
console.log(welcome);
printGreenText(art);
// const prompt = "Type something: ";
// process.stdout.write(prompt);
// for await (const line of console) {
//   if (line === "exit") break;
//   console.log(`You typed: ${line}`);
//   process.stdout.write(prompt);
// }
