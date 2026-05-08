let globalJob: any = null;

export const setJob = (job: any) => {
  globalJob = job;
};

export const getJob = () => {
  return globalJob;
};

export const clearJob = () => {
  globalJob = null;
};