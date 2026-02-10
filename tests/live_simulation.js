import axios from 'axios';

//const BASE_URL = 'http://localhost:3005';
const BASE_URL = 'https://usmm.global-desk.top'

// Generate 100 unique project scenarios
const scenarios = Array.from({ length: 100 }).map((_, i) => ({
  id: `project_${Math.random().toString(36).substr(2, 6)}_${i}`,
  count: Math.floor(Math.random() * 2) + 1 
}));

async function runSimulation() {
  const initialDelay = 1000;
  console.log(`⏳ Scaling up... Dispatched to 100 concurrent project instances.`);
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  console.log(`🚀 Launching USMM Stress Simulation against ${BASE_URL}...`);

  const allRequests = scenarios.flatMap(scenario => {
    return Array.from({ length: scenario.count }).map(async (_, i) => {
      // Wide spread over 30 seconds for maximum density without chaos
      const requestDelay = Math.random() * 30000;
      await new Promise(resolve => setTimeout(resolve, requestDelay));
      
      try {
        const response = await axios.post(`${BASE_URL}/v1/post`, {
          platform: 'fb',
          caption: `Stress Test: Request from ${scenario.id}`,
          options: { dryRun: true }
        }, {
          headers: {
            'x-platform-id': scenario.id,
            'x-platform-token': `token_${scenario.id}`
          }
        });
        console.log(`✅ [${scenario.id}] Queued.`);
      } catch (error) {
        console.error(`❌ [${scenario.id}] Failed:`, error.response?.data || error.message);
      }
    });
  });

  await Promise.all(allRequests);
  console.log('\n✨ Simulation complete. 50 unique project queues processed.');
}

runSimulation();
