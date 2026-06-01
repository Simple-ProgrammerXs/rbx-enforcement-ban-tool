export class Logger {
  private static readonly reset = "\u001b[0m";
  private static readonly dim = "\u001b[90m";
  private static readonly cyan = "\u001b[96m";
  private static readonly red = "\u001b[91m";
  private static readonly green = "\u001b[92m";
  private static readonly yellow = "\u001b[93m";
  private static readonly magenta = "\u001b[95m";
  private static readonly white = "\u001b[97m";

  private static timestamp(): string {
    return new Date().toLocaleTimeString("en-GB", { hour12: false });
  }

  private static print(icon: string, label: string, color: string, message: string): void {
    const padded = label.padEnd(8, " ");
    process.stdout.write(
      `${this.dim}[${this.timestamp()}]${this.reset} ${color}${icon}${this.reset} ${color}${padded}${this.reset} ${this.dim}|${this.reset} ${message}\n`,
    );
  }

  private static width(): number {
    return process.stdout.columns || 80;
  }

  static info(message: string): void {
    this.print("[i]", "INFO", this.cyan, message);
  }

  static success(message: string): void {
    this.print("[+]", "SUCCESS", this.green, message);
  }

  static error(message: string): void {
    this.print("[-]", "ERROR", this.red, message);
  }

  static warning(message: string): void {
    this.print("[!]", "WARNING", this.yellow, message);
  }

  static captcha(message: string): void {
    this.print("[*]", "CAPTCHA", this.yellow, message);
  }

  static solving(message: string): void {
    this.print("[~]", "SOLVING", this.magenta, message);
  }

  static solved(message: string): void {
    this.print("[+]", "SOLVED", this.yellow, message);
  }

  private static centered(message: string): string {
    return message.padStart(Math.floor((this.width() + message.length) / 2), " ");
  }

  static header(message: string, subtitle?: string): void {
    const line = "\u2500".repeat(this.width());
    let out = `\n${this.red}${line}${this.reset}\n${this.white}${this.centered(message)}${this.reset}\n`;
    if (subtitle) {
      out += `${this.dim}${this.centered(subtitle)}${this.reset}\n`;
    }
    out += `${this.red}${line}${this.reset}\n\n`;
    process.stdout.write(out);
  }

  static note(message: string): void {
    process.stdout.write(`${this.dim}${this.centered(message)}${this.reset}\n`);
  }

  static separator(): void {
    process.stdout.write(`${this.red}${"\u2500".repeat(this.width())}${this.reset}\n`);
  }
}
