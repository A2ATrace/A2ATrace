import { startTelemetry } from './utils/telemetry.js';
import path from 'path';
import os from 'os';
import { trace, metrics, context, SpanStatusCode } from '@opentelemetry/api';

type DemoConfig = {
  intervalMs: number; // delay between traces
  count: number; // total traces to emit
  samplerRatio: number; // probability [0,1]
};

function parseArgs(): DemoConfig {
  const argv = process.argv.slice(2);
  const get = (name: string, def?: string) => {
    const i = argv.findIndex((a) => a === `--${name}`);
    if (i !== -1 && argv[i + 1]) return argv[i + 1];
    return def;
  };

  const intervalMs = Number(
    get('interval', process.env.DEMO_TRACE_INTERVAL_MS || '15000')
  );
  const count = Number(get('count', process.env.DEMO_TRACE_COUNT || '10'));
  const samplerRatio = Number(
    get('sampler-ratio', process.env.DEMO_SAMPLER_RATIO || '0.2')
  );

  return {
    intervalMs: isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 15000,
    count: isFinite(count) && count > 0 ? count : 10,
    samplerRatio:
      isFinite(samplerRatio) && samplerRatio >= 0 && samplerRatio <= 1
        ? samplerRatio
        : 0.2,
  };
}

/**
 * Demo script that generates sample telemetry data
 * to verify the A2ATrace infrastructure is working
 */
async function demo() {
  const demoCfg = parseArgs();

  // Configure sampling via env (respected by @opentelemetry/sdk-node)
  // ParentBasedTraceIdRatioBased with provided ratio
  process.env.OTEL_TRACES_SAMPLER = 'traceidratio';
  process.env.OTEL_TRACES_SAMPLER_ARG = String(demoCfg.samplerRatio);

  const homeDir = os.homedir();
  const configPath = path.join(homeDir, '.a2a', 'a2a.config.json');

  console.log('🚀 Starting demo telemetry...');
  console.log(
    `   interval=${demoCfg.intervalMs}ms, count=${demoCfg.count}, samplerRatio=${demoCfg.samplerRatio}`
  );

  // Initialize OpenTelemetry
  await startTelemetry(configPath);

  // Get tracer and meter
  const tracer = trace.getTracer('demo-agent', '1.0.0');
  const meter = metrics.getMeter('demo-agent', '1.0.0');

  // Create some metrics
  const requestCounter = meter.createCounter('demo.requests', {
    description: 'Count of demo requests',
  });

  const processingTime = meter.createHistogram('demo.processing_time', {
    description: 'Processing time in milliseconds',
    unit: 'ms',
  });

  console.log('📊 Generating sample traces and metrics...');

  // Generate sample traces at a controlled rate
  let iteration = 0;
  const interval = setInterval(() => {
    iteration++;

    // Create a parent span
    const parentSpan = tracer.startSpan('demo.parent-operation', {
      attributes: {
        'demo.iteration': iteration,
        'agent.name': 'demo-agent',
        'operation.type': 'parent',
      },
    });

    const parentContext = trace.setSpan(context.active(), parentSpan);

    // Simulate some work with child spans
    context.with(parentContext, () => {
      const childSpan1 = tracer.startSpan('demo.fetch-data', {
        attributes: {
          'operation.type': 'child',
          'data.source': 'database',
        },
      });

      // Simulate database fetch
      setTimeout(() => {
        childSpan1.addEvent('data.fetched', {
          'records.count': Math.floor(Math.random() * 100),
        });
        childSpan1.end();
      }, Math.random() * 50);

      const childSpan2 = tracer.startSpan('demo.process-data', {
        attributes: {
          'operation.type': 'child',
          'processor.version': '1.0',
        },
      });

      // Simulate processing
      const processingTimeMs = Math.random() * 100;
      setTimeout(() => {
        childSpan2.addEvent('data.processed', {
          'processing.time': processingTimeMs,
        });
        childSpan2.end();

        // Record metrics
        requestCounter.add(1, {
          status: 'success',
          agent: 'demo-agent',
        });
        processingTime.record(processingTimeMs, {
          operation: 'process-data',
        });
      }, processingTimeMs);

      // Sometimes create an error span
      if (Math.random() > 0.8) {
        const errorSpan = tracer.startSpan('demo.error-operation', {
          attributes: {
            'operation.type': 'child',
            'error.type': 'random',
          },
        });
        errorSpan.recordException(new Error('Random demo error'));
        errorSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'Error occurred',
        });
        errorSpan.end();
      }
    });

    // End parent span
    setTimeout(() => {
      parentSpan.addEvent('operation.completed');
      parentSpan.end();
    }, 150);

    console.log(`✨ Generated trace ${iteration}`);

    // Stop after configured count
    if (iteration >= demoCfg.count) {
      console.log('✅ Demo completed! Check Grafana for traces and metrics.');
      clearInterval(interval);
      setTimeout(() => process.exit(0), 2000);
    }
  }, demoCfg.intervalMs);

  console.log('📡 Sending traces to http://localhost:4318/v1/traces');
  console.log('🎨 View in Grafana at http://localhost:4001');
  console.log('⏱️  Use --interval <ms> and --count <n> to control rate.');
  console.log('   Press Ctrl+C to stop early\n');
}

demo().catch(console.error);
