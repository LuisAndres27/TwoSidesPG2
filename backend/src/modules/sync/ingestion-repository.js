// Storage-neutral async port. Receipt + unique fact + heads must commit together.
export function assertIngestionRepository(repository, identityRepository) {
  if (!repository || repository.identityRepository !== identityRepository ||
      !repository.coordinator || repository.coordinator !== identityRepository.coordinator ||
      typeof repository.coordinator.run !== 'function' ||
      !['acceptOperation','findReceipts'].every(m => typeof repository[m] === 'function'))
    throw new Error('Sync requires a coordinated identity and ingestion repository');
  return repository;
}
