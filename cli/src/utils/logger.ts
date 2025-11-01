import chalk from 'chalk';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private minLevel: LogLevel;
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
    this.minLevel =
      envLevel && envLevel in this.levelPriority ? envLevel : 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);

    let coloredLevel: string;
    switch (level) {
      case 'debug':
        coloredLevel = chalk.gray(levelStr);
        break;
      case 'info':
        coloredLevel = chalk.cyan(levelStr);
        break;
      case 'warn':
        coloredLevel = chalk.yellow(levelStr);
        break;
      case 'error':
        coloredLevel = chalk.red(levelStr);
        break;
    }

    let output = `${chalk.gray(timestamp)} ${coloredLevel} ${message}`;

    if (context && Object.keys(context).length > 0) {
      output += chalk.gray(` ${JSON.stringify(context)}`);
    }

    return output;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const ctx = { ...context };
      if (error instanceof Error) {
        ctx.error = error.message;
        ctx.stack = error.stack;
      } else if (error) {
        ctx.error = String(error);
      }
      console.error(this.formatMessage('error', message, ctx));
    }
  }
}

// Export singleton instance
export const logger = new Logger();
