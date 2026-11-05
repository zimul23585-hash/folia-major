import relayAudio from '../server/kugou/audioRelay.mjs';

// Vercel discovers this entry by its api/ path; implementation stays with its platform.
export const config = { runtime: 'edge' };
export default relayAudio;
