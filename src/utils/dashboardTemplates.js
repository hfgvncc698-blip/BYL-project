// Retain the existing Firestore-shaped consumer and lossless document contents.
// A rolling deployment with an older API can still use the direct SDK path.
export async function readDashboardTemplates(coachId, { request, fallback, cachedPrograms = [] }) {
  try {
    const known = new Map(cachedPrograms.filter(program => program.__dashboardReadVersion && program.createdBy === coachId).map(program => [program.id, program]));
    const response = await request('/programs/dashboard-templates', {
      method: 'POST', timeoutMs: 10000,
      body: JSON.stringify({ coachId, knownVersions: Object.fromEntries([...known].map(([id, program]) => [id, program.__dashboardReadVersion])) }),
    });
    if (!Array.isArray(response.programs) || !Array.isArray(response.unchanged)) throw new Error("Invalid program response");
    const retained = response.unchanged.map(id => {
      if (!known.has(id)) throw new Error('Missing unchanged program');
      return known.get(id);
    });
    const docs = [...retained, ...response.programs].map(program => ({ id: program.id, data: () => program }));
    return { docs, size: docs.length, empty: docs.length === 0, transport: 'incremental-api', changed: response.programs.length };
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) throw error;
    return fallback();
  }
}
