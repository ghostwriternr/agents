import { Agent, AgentDebugger, type ObservabilityEvent } from "agents";

/**
 * Example: Creating an Agent with Debug Mode Enabled
 */
export class DebugEnabledAgent extends Agent<{}> {
  // Enable debug mode for this agent
  static options = {
    hibernate: true,
    debug: {
      enabled: true,
      maxEventHistory: 200, // Keep last 200 events
    },
  };

  initialState = {
    counter: 0,
    messages: [] as string[],
  };

  // Example callable method that will emit RPC events
  async incrementCounter() {
    this.setState({
      ...this.state,
      counter: this.state.counter + 1,
    });
    return this.state.counter;
  }

  // Example method that might throw an error (for testing error events)
  async riskyOperation(shouldFail: boolean) {
    if (shouldFail) {
      throw new Error("Risky operation failed!");
    }
    return "Success!";
  }
}

/**
 * Example: Connecting to an Agent with the Debug Client
 */
async function debugExample() {
  // Connect to a running agent instance
  const agentUrl = "http://localhost:8787/agents/debug-enabled-agent/my-instance";

  // Create debug client with event handlers
  const debugger = new AgentDebugger(agentUrl, {
    onInit: (data) => {
      console.log("=== Debug Connection Established ===");
      console.log("Agent Class:", data.agentClass);
      console.log("Agent Name:", data.agentName);
      console.log("Current State:", JSON.stringify(data.state, null, 2));
      console.log("Event History Count:", data.history.length);
      console.log("=====================================\n");
    },

    onEvent: (event: ObservabilityEvent) => {
      console.log(`[${new Date(event.timestamp).toISOString()}] ${event.type}: ${event.displayMessage}`);

      // Log specific event details based on type
      switch (event.type) {
        case "rpc":
          console.log("  Method:", event.payload.method);
          console.log("  Args:", event.payload.args);
          console.log("  Success:", event.payload.success);
          break;

        case "state:update":
          console.log("  New State:", JSON.stringify(event.payload.state, null, 2));
          break;

        case "error":
          console.log("  Error:", event.payload.error.message);
          console.log("  Context:", event.payload.context);
          break;
      }
      console.log("---");
    },

    onStateUpdate: (state) => {
      console.log("State Updated:", JSON.stringify(state, null, 2));
    },
  });

  // Wait for connection
  await new Promise(resolve => debugger.addEventListener('open', resolve));

  // Example: Request current state
  console.log("\n=== Requesting Current State ===");
  debugger.getState();

  // Example: Get event history
  setTimeout(() => {
    console.log("\n=== Requesting Event History (last 10) ===");
    debugger.getHistory(10);
  }, 1000);

  // Example: Clear history
  setTimeout(() => {
    console.log("\n=== Clearing Event History ===");
    debugger.clearHistory();
  }, 2000);

  // Keep connection open for debugging
  // In a real app, you'd close when done: debugger.close()
}

/**
 * Example: Simple CLI Debug Monitor
 */
function createDebugMonitor(agentUrl: string) {
  const debugger = new AgentDebugger(agentUrl);

  // Track event counts by type
  const eventCounts: Record<string, number> = {};

  debugger.onEvent((event) => {
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;

    // Clear console and show summary
    console.clear();
    console.log("=== Agent Debug Monitor ===");
    console.log("URL:", agentUrl);
    console.log("\nEvent Counts:");
    Object.entries(eventCounts).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    console.log("\nLatest Event:");
    console.log(`  Type: ${event.type}`);
    console.log(`  Message: ${event.displayMessage}`);
    console.log(`  Time: ${new Date(event.timestamp).toLocaleTimeString()}`);
  });

  return debugger;
}

// Export for use in other examples
export { debugExample, createDebugMonitor };