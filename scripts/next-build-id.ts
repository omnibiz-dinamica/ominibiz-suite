import { formatBuildDate, nextBuildId, runGit } from "./build-id.ts";

const subjects = (runGit(["log", "--format=%s"]) ?? "").split(/\r?\n/).filter(Boolean);

console.log(nextBuildId(formatBuildDate(new Date()), subjects));
