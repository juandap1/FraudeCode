class loader {
  private frames: string[];
  private interval: NodeJS.Timeout | null;
  private i: number;
  private showTime: boolean;

  private count = 0;

  constructor(loadingText: string = "Loading", showTime: boolean = false) {
    this.frames = [
      `${m("·")}  ${m(loadingText)}.  `,
      `${m("•")}  ${m(loadingText)}.. `,
      `${m("●")}  ${m(loadingText)}...`,
    ];
    this.i = 0;
    this.interval = null;
    this.showTime = showTime;
  }

  start() {
    this.interval = setInterval(() => {
      this.count++;
      // 1. Save cursor position (at the end of the LLM stream line)
      process.stdout.write("\x1b[s");

      // 2. Move down one line
      process.stdout.write("\x1b[1B");
      process.stdout.write(
        `\r${this.frames[this.i++ % this.frames.length]} ${
          this.showTime ? `(${(this.count / 10).toFixed(1)}s)` : ""
        }`
      );

      // 4. Restore cursor position (back to the end of the LLM stream line)
      process.stdout.write("\x1b[u");
    }, 100);
  }

  stop() {
    if (!this.interval) return;
    clearInterval(this.interval);
    // Move down to the spinner line
    process.stdout.write("\x1b[1B");

    // // Clear the spinner line
    // process.stdout.write('\r\x1b[K');

    // // Move back up to the line where the user prompt will appear (optional, depends on your final prompt design)
    // process.stdout.write('\x1b[1A');
    process.stdout.write(`\r✔ Done in ${(this.count / 10).toFixed(1)}s!\n`);
  }
}
