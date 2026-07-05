function includesSimplifiedChinese(build) {
  return build.langs?.includes("zh_CN");
}

function newestBuild(builds, predicate, description) {
  const build = builds.find(
    (candidate) => predicate(candidate) && includesSimplifiedChinese(candidate),
  );
  if (!build) throw new Error(`No ${description} build with zh_CN found`);
  return build;
}

export function selectBuilds(builds, requestedVersions) {
  const latest = newestBuild(
    builds,
    (build) => build.prerelease,
    "latest experimental",
  );
  const stable = newestBuild(builds, (build) => !build.prerelease, "stable");

  const selected = requestedVersions.map((version) => {
    if (version === "latest") return latest;
    if (version === "stable") return stable;
    const build = builds.find(
      (candidate) =>
        String(candidate.build_number) === version &&
        includesSimplifiedChinese(candidate),
    );
    if (!build) {
      throw new Error(`Requested build with zh_CN not found: ${version}`);
    }
    return build;
  });

  return [
    ...new Map(selected.map((build) => [build.build_number, build])).values(),
  ];
}
