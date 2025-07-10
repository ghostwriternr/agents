import { PartySocket, type PartySocketOptions } from "partysocket";
import type { ObservabilityEvent } from "./observability";
import type { AgentStub } from "./";

export interface DebugEventData {
  type: 'debug:event';
  event: ObservabilityEvent;
}

export interface DebugInitData {
  type: 'debug:init';
  data: {
    state: unknown;
    history: ObservabilityEvent[];
    agentClass: string;
    agentName: string;
    timestamp: number;
  };
}

export interface DebugStateData {
  type: 'debug:state';
  data: {
    state: unknown;
    timestamp: number;
  };
}

export interface DebugHistoryData {
  type: 'debug:history';
  data: {
    events: ObservabilityEvent[];
    total: number;
    timestamp: number;
  };
}

export interface DebugMessage {
  type: 'debug:get_state' | 'debug:get_history' | 'debug:clear_history' | 'debug:ping';
  limit?: number;
}

export type DebugResponse =
  | DebugEventData
  | DebugInitData
  | DebugStateData
  | DebugHistoryData
  | { type: 'debug:history_cleared'; timestamp: number }
  | { type: 'debug:pong'; timestamp: number };

export interface AgentDebuggerOptions extends Omit<PartySocketOptions, 'party' | 'room' | 'query'> {
  onEvent?: (event: ObservabilityEvent) => void;
  onInit?: (data: DebugInitData['data']) => void;
  onStateUpdate?: (state: unknown) => void;
}

/**
 * Client for debugging Cloudflare Agents
 * Connects to an agent's debug WebSocket endpoint to receive real-time events
 */
export class AgentDebugger extends PartySocket {
  private eventHandlers: {
    event?: (event: ObservabilityEvent) => void;
    init?: (data: DebugInitData['data']) => void;
    stateUpdate?: (state: unknown) => void;
  } = {};

  constructor(
    agentOrUrl: AgentStub<any> | string,
    options: AgentDebuggerOptions = {}
  ) {
    const url = typeof agentOrUrl === 'string'
      ? agentOrUrl
      : agentOrUrl.url.toString();

    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/');
    const agentIndex = pathParts.indexOf('agents');

    if (agentIndex === -1 || agentIndex >= pathParts.length - 2) {
      throw new Error('Invalid agent URL format');
    }

    const party = pathParts[agentIndex + 1];
    const room = pathParts[agentIndex + 2];

    super({
      ...options,
      host: parsedUrl.origin,
      party,
      room,
      prefix: 'agents',
      query: {
        ...options.query,
        mode: 'debug'
      }
    });

    // Set up event handlers
    if (options.onEvent) this.eventHandlers.event = options.onEvent;
    if (options.onInit) this.eventHandlers.init = options.onInit;
    if (options.onStateUpdate) this.eventHandlers.stateUpdate = options.onStateUpdate;

    // Handle incoming messages
    this.addEventListener('message', this.handleMessage.bind(this));
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data) as DebugResponse;

      switch (data.type) {
        case 'debug:event':
          this.eventHandlers.event?.(data.event);
          break;

        case 'debug:init':
          this.eventHandlers.init?.(data.data);
          this.eventHandlers.stateUpdate?.(data.data.state);
          break;

        case 'debug:state':
          this.eventHandlers.stateUpdate?.(data.data.state);
          break;

        case 'debug:history':
          // Emit each historical event
          data.data.events.forEach(event => {
            this.eventHandlers.event?.(event);
          });
          break;
      }
    } catch (e) {
      console.error('Failed to parse debug message:', e);
    }
  }

  /**
   * Request the current state from the agent
   */
  getState() {
    const message: DebugMessage = { type: 'debug:get_state' };
    this.send(JSON.stringify(message));
  }

  /**
   * Request event history from the agent
   * @param limit Maximum number of events to retrieve
   */
  getHistory(limit?: number) {
    const message: DebugMessage = { type: 'debug:get_history', limit };
    this.send(JSON.stringify(message));
  }

  /**
   * Clear the event history on the agent
   */
  clearHistory() {
    const message: DebugMessage = { type: 'debug:clear_history' };
    this.send(JSON.stringify(message));
  }

  /**
   * Send a ping to check if the connection is alive
   */
  ping() {
    const message: DebugMessage = { type: 'debug:ping' };
    this.send(JSON.stringify(message));
  }

  /**
   * Set a handler for incoming events
   */
  onEvent(handler: (event: ObservabilityEvent) => void) {
    this.eventHandlers.event = handler;
  }

  /**
   * Set a handler for state updates
   */
  onStateUpdate(handler: (state: unknown) => void) {
    this.eventHandlers.stateUpdate = handler;
  }
}

/**
 * Helper function to create a debug client for an agent
 */
export function createAgentDebugger(
  agentOrUrl: AgentStub<any> | string,
  options?: AgentDebuggerOptions
): AgentDebugger {
  return new AgentDebugger(agentOrUrl, options);
}