import { generateText, gateway } from "ai";
import type { AiConfig } from "../types";
import { Logger } from "./logger";

const SYSTEM_PROMPT = `You are helping an account owner draft a concise Roblox appeal. Write casually and truthfully, like a real person asking support to review the decision.

HOW TO WRITE:
- CRITICAL: Stay under 1250 characters
- First person: "my account", "I think", "I understand", etc.
- Casual but polite tone
- Mention the username naturally
- Do not invent specific facts, excuses, family details, purchases, locations, ages, or shared-account history
- Ask for a manual review and say the user is willing to provide more information if needed
- Keep it concise - don't over-explain

REQUIRED ELEMENTS (MUST INCLUDE ALL):
1. Brief greeting (Hi, Hey, Hello)
2. Explain that the user is appealing the moderation action
3. Mention that the user believes there may have been a mistake or missing context
4. MUST ask politely: "Could you please review..." or "Please look into..."
5. MUST thank them: "Thanks" or "Thank you"

Write it naturally like a real person would. Keep it SHORT.

ONLY output the appeal message. No quotes, no extra text.`;

export class AppealGenerator {
  constructor(private readonly config: AiConfig) {
    process.env.AI_GATEWAY_API_KEY = config.api_key;
  }

  async generateAppeal(username: string, maxRetries = 2): Promise<string | null> {
    const userPrompt = `Write an appeal for the account "${username}". Keep it honest, neutral, casual, and polite.`;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const { text } = await generateText({
          model: gateway(this.config.model),
          system: SYSTEM_PROMPT,
          prompt: userPrompt,
          temperature: 1,
          maxOutputTokens: 300,
          topP: 0.95,
        });

        const raw = text.trim();
        const appeal = this.cleanAppeal(raw);

        if (appeal && this.validateAppeal(appeal, username)) {
          return appeal;
        }

        if (attempt < maxRetries) {
          Logger.warning(
            `Generated appeal failed validation, retrying (${attempt + 1}/${maxRetries})`,
          );
        }
      } catch (error) {
        if (attempt >= maxRetries) {
          const message = error instanceof Error ? error.message : "Unknown AI generation error";
          Logger.error(`AI generation failed: ${message}`);
          return null;
        }

        Logger.warning(`AI generation error, retrying (${attempt + 1}/${maxRetries})`);
      }
    }

    Logger.error("Generated appeal failed validation after retries");
    return null;
  }

  private cleanAppeal(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1).trim();
    }

    return trimmed;
  }

  private validateAppeal(appeal: string, username: string): boolean {
    const normalized = appeal.toLowerCase();

    if (appeal.length > 1250) {
      Logger.warning(`Appeal too long: ${appeal.length} chars`);
      return false;
    }

    if (!normalized.includes(username.toLowerCase())) {
      Logger.warning(`Username "${username}" not found in appeal`);
      return false;
    }

    if (
      !["hi", "hello", "hey", "good morning", "good afternoon", "good day"].some((greeting) =>
        normalized.includes(greeting),
      )
    ) {
      Logger.warning("No greeting found in appeal");
      return false;
    }

    if (
      !["thank", "please", "could you", "can you"].some((phrase) => normalized.includes(phrase))
    ) {
      Logger.warning("No polite request found in appeal");
      return false;
    }

    return true;
  }
}
