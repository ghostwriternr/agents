import type { Message } from "ai";
import type { Connection } from "partyserver";
import type { Schedule } from "../index";
import { getCurrentAgent } from "../index";

type BaseEvent<
  T extends string,
  // biome-ignore lint/complexity/noBannedTypes: an empty object for non-payload events is fine
  Payload extends Record<string, unknown> = {},
> = {
  type: T;
  /**
   * The unique identifier for the event
   */
  id: string;
  /**
   * The message to display in the logs for this event, should the implementation choose to display
   * a human-readable message.
   */
  displayMessage: string;
  /**
   * The payload of the event
   */
  payload: Payload;
  /**
   * The timestamp of the event in milliseconds since epoch
   */
  timestamp: number;
};

/**
 * The type of events that can be emitted by an Agent
 */
export type ObservabilityEvent =
  | BaseEvent<
      "state:update",
      {
        state: unknown;
        previousState: unknown;
      }
    >
  | BaseEvent<
      "rpc",
      {
        method: string;
        args: unknown[];
        streaming?: boolean;
        success: boolean;
      }
    >
  | BaseEvent<
      "message:request" | "message:response",
      {
        message: Message[];
      }
    >
  | BaseEvent<"message:clear">
  | BaseEvent<
      "schedule:create" | "schedule:execute" | "schedule:cancel",
      Schedule<unknown>
    >
  | BaseEvent<"destroy">
  | BaseEvent<
      "connect",
      {
        connectionId: string;
      }
    >
  | BaseEvent<
      "error",
      {
        error: Error;
        context: string;
        connectionId?: string;
      }
    >;

export interface Observability {
  /**
   * Emit an event for the Agent's observability implementation to handle.
   * @param event - The event to emit
   * @param ctx - The execution context of the invocation
   */
  emit(event: ObservabilityEvent, ctx: DurableObjectState): void;

  /**
   * Handle a debug connection (optional)
   * @param connection - The WebSocket connection from a debug client
   */
  handleDebugConnection?(connection: Connection): void;

  /**
   * Handle messages from debug clients (optional)
   * @param connection - The WebSocket connection from a debug client
   * @param message - The message received
   */
  handleDebugMessage?(connection: Connection, message: unknown): void;

  /**
   * Remove a debug connection (optional)
   * @param connection - The WebSocket connection to remove
   */
  removeDebugConnection?(connection: Connection): void;
}

/**
 * A generic observability implementation that logs events to the console.
 */
export const genericObservability: Observability = {
  emit(event) {
    // In local mode, we display a pretty-print version of the event for easier debugging.
    if (isLocalMode()) {
      console.log(event.displayMessage);
      return;
    }

    console.log(event);
  },
};

function isLocalMode() {
  try {
    const agent = getCurrentAgent();
    if (!agent?.request) {
      return false;
    }

    const url = new URL(agent.request.url);
    return url.hostname === "localhost";
  } catch {
    // If we're outside of AsyncLocalStorage context, assume not local mode
    return false;
  }
}

export { WebSocketDebugObservability } from "./websocket-debug";
export type { WebSocketDebugOptions } from "./websocket-debug";
