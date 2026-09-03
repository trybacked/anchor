export type CommandHandler = (args: string[]) => Promise<void>;

export interface Command {
  readonly name: string;
  readonly description: string;
  readonly handler: CommandHandler;
}

export const COMMANDS: readonly Command[] = [];
