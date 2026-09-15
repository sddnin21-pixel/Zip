import { modelRouter } from "../../src/core/router/model-router";
import { getProvider } from "../../src/providers/registry";
import { keyManager } from "../../src/core/keys/key-manager";
import { normalizedError } from "../../src/providers/shared/errors";
import { textMessage } from "../../src/core/conversation/message-types";

jest.mock("../../src/providers/registry");
jest.mock("../../src/core/keys/key-manager");
jest.mock("../../src/security/rate-limiter", () => ({
  rateLimiter: { acquire: jest.fn().mockResolvedValue(undefined), tryAcquire: jest.fn().mockReturnValue(true) },
}));

describe("ModelRouter failover (brief sections 14, 66, 71)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("falls over to the next target when the primary provider errors, and reports the switch", async () => {
    const failingChat = jest.fn().mockRejectedValue(normalizedError("SERVER_ERROR", "XKIRO is down"));
    const succeedingChat = jest.fn().mockResolvedValue({
      message: { id: "m1", role: "assistant", parts: [{ type: "text", text: "hello from fallback" }], timestamp: Date.now() },
    });

    (getProvider as jest.Mock).mockImplementation((id: string) => {
      if (id === "xkiro") {
        return { chat: failingChat, normalizeError: (e: unknown) => e };
      }
      return { chat: succeedingChat, normalizeError: (e: unknown) => e };
    });
    (keyManager.resolveKey as jest.Mock).mockResolvedValue({ id: "key1", secret: "secret" });
    (keyManager.markSuccess as jest.Mock).mockResolvedValue(undefined);
    (keyManager.markInvalid as jest.Mock).mockResolvedValue(undefined);
    (keyManager.markRateLimited as jest.Mock).mockResolvedValue(undefined);

    const result = await modelRouter.chat({
      primary: { providerId: "xkiro", modelId: "some-model" },
      fallbacks: [{ providerId: "openrouter", modelId: "fallback-model" }],
      request: { messages: [textMessage("user", "hi")] },
    });

    expect(failingChat).toHaveBeenCalledTimes(1);
    expect(succeedingChat).toHaveBeenCalledTimes(1);
    expect(result.route.switchedFrom).toEqual({ providerId: "xkiro", modelId: "some-model" });
    expect(result.route.usedProvider).toBe("openrouter");
    expect(result.response.message.parts[0]).toEqual({ type: "text", text: "hello from fallback" });
  });

  it("throws the last normalized error when every target in the chain fails — never silently swallows failure", async () => {
    const failingChat = jest.fn().mockRejectedValue(normalizedError("SERVER_ERROR", "all down"));
    (getProvider as jest.Mock).mockReturnValue({ chat: failingChat, normalizeError: (e: unknown) => e });
    (keyManager.resolveKey as jest.Mock).mockResolvedValue({ id: "key1", secret: "secret" });
    (keyManager.markInvalid as jest.Mock).mockResolvedValue(undefined);
    (keyManager.markRateLimited as jest.Mock).mockResolvedValue(undefined);

    await expect(
      modelRouter.chat({
        primary: { providerId: "xkiro", modelId: "a" },
        fallbacks: [{ providerId: "openrouter", modelId: "b" }],
        request: { messages: [textMessage("user", "hi")] },
      })
    ).rejects.toMatchObject({ code: "SERVER_ERROR" });
  });

  it("does not call chat at all when no key is available, and reports AUTH_FAILED (never an infinite retry)", async () => {
    (keyManager.resolveKey as jest.Mock).mockResolvedValue(null);
    (keyManager.toAuthError as jest.Mock).mockReturnValue(normalizedError("AUTH_FAILED", "no usable key"));
    const chatFn = jest.fn();
    (getProvider as jest.Mock).mockReturnValue({ chat: chatFn, normalizeError: (e: unknown) => e });

    await expect(
      modelRouter.chat({
        primary: { providerId: "xkiro", modelId: "a" },
        request: { messages: [textMessage("user", "hi")] },
      })
    ).rejects.toMatchObject({ code: "AUTH_FAILED" });

    expect(chatFn).not.toHaveBeenCalled();
  });

  it("never contacts a provider for the 'local' target (no key concept)", async () => {
    const localChat = jest.fn().mockResolvedValue({
      message: { id: "m1", role: "assistant", parts: [{ type: "text", text: "local reply" }], timestamp: Date.now() },
    });
    (getProvider as jest.Mock).mockReturnValue({ chat: localChat, normalizeError: (e: unknown) => e });

    await modelRouter.chat({
      primary: { providerId: "local", modelId: "some-gguf-model" },
      request: { messages: [textMessage("user", "hi")] },
    });

    expect(keyManager.resolveKey).not.toHaveBeenCalled();
    expect(localChat).toHaveBeenCalledWith("", expect.objectContaining({ modelId: "some-gguf-model" }));
  });
});
