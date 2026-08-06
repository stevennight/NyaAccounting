module.exports = ({ config }) => {
  const repository =
    process.env.NYA_ACCOUNTING_GITHUB_REPOSITORY?.trim() ||
    config.extra?.githubRepository ||
    null;

  return {
    ...config,
    extra: {
      ...config.extra,
      githubRepository: repository,
    },
  };
};
