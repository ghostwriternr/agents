import type { Connection } from "partyserver";
import type { Agent } from "../index";
import type { Observability, ObservabilityEvent } from "./index";

export interface WebSocketDebugOptions {
  /**
   * Maximum number of events to keep in history
   * @default 100
   */
  maxEventHistory?: number;

  /**
   * Whether to include event payloads in the stream
   * @default true
   */
  includePayloads?: boolean;
}

/**
 * WebSocket-based observability implementation for debugging agents
 * Streams events to connected debug clients and maintains event history
 */
export class WebSocketDebugObservability implements Observability {
  private debugConnections = new Set<Connection>();
  private eventHistory: ObservabilityEvent[] = [];
  private maxHistorySize: number;
  private includePayloads: boolean;

  constructor(
    private agent: Agent<any>,
    options: WebSocketDebugOptions = {}
  ) {
    this.maxHistorySize = options.maxEventHistory ?? 100;
    this.includePayloads = options.includePayloads ?? true;
  }

  /**
   * Emit an event to all connected debug clients
   */
  emit(event: ObservabilityEvent, ctx: DurableObjectState): void {
    // Store in ring buffer
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Prepare event for streaming (optionally strip payloads)
    const streamEvent = this.includePayloads ? event : {
      ...event,
      payload: undefined
    };

    // Stream to connected debug clients
    const message = JSON.stringify({
      type: 'debug:event',
      event: streamEvent
    });

    for (const connection of this.debugConnections) {
      try {
        connection.send(message);
      } catch (e) {
        // Connection might be closed, remove it
        this.debugConnections.delete(connection);
        console.error('Failed to send debug event to connection:', e);
      }
    }
  }

  /**
   * Handle a new debug connection
   */
  handleDebugConnection(connection: Connection): void {
    this.debugConnections.add(connection);

    // Send initial state and event history
    try {
      connection.send(JSON.stringify({
        type: 'debug:init',
        data: {
          state: this.agent.state,
          history: this.eventHistory,
          agentClass: this.agent.constructor.name,
          agentName: this.agent.name,
          timestamp: Date.now()
        }
      }));
    } catch (e) {
      console.error('Failed to send debug init to connection:', e);
      this.debugConnections.delete(connection);
    }
  }

  /**
   * Handle messages from debug clients
   */
  handleDebugMessage(connection: Connection, message: unknown): void {
    if (typeof message !== 'string') {
      return;
    }

    try {
      const parsed = JSON.parse(message);

      switch (parsed.type) {
        case 'debug:get_state':
          connection.send(JSON.stringify({
            type: 'debug:state',
            data: {
              state: this.agent.state,
              timestamp: Date.now()
            }
          }));
          break;

        case 'debug:get_history':
          const limit = parsed.limit || this.eventHistory.length;
          connection.send(JSON.stringify({
            type: 'debug:history',
            data: {
              events: this.eventHistory.slice(-limit),
              total: this.eventHistory.length,
              timestamp: Date.now()
            }
          }));
          break;

        case 'debug:clear_history':
          this.eventHistory = [];
          connection.send(JSON.stringify({
            type: 'debug:history_cleared',
            timestamp: Date.now()
          }));
          break;

        case 'debug:ping':
          connection.send(JSON.stringify({
            type: 'debug:pong',
            timestamp: Date.now()
          }));
          break;

        default:
          console.warn('Unknown debug message type:', parsed.type);
      }
    } catch (e) {
      console.error('Failed to handle debug message:', e);
    }
  }

  /**
   * Remove a connection from the debug set
   */
  removeDebugConnection(connection: Connection): void {
    this.debugConnections.delete(connection);
  }

  /**
   * Get the number of active debug connections
   */
  get debugConnectionCount(): number {
    return this.debugConnections.size;
  }
}