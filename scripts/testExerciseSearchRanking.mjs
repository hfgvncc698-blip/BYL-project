import assert from "node:assert/strict";
import { scoreExerciseSearch } from "../src/utils/exerciseSearchRanking.js";

const query = { queryNorm: "leg curl", queryTokens: ["leg", "curl"] };
const score = (entry) => scoreExerciseSearch({ ...query, ...entry });

const realLegCurl = score({
  primaryNameNorm: "leg curl allonge",
  aliasNorms: ["curl jambes allonge"],
  blob: "ischio jambiers machine",
});
const bicepsCurlWithLooseLegMetadata = score({
  primaryNameNorm: "curl biceps concentration",
  aliasNorms: ["concentration biceps curl"],
  blob: "bras biceps curl jambes position assise leg",
});
assert.ok(
  realLegCurl > bicepsCurlWithLooseLegMetadata,
  "A full name match must rank above words split between name and metadata"
);

const translatedLegCurl = score({
  primaryNameNorm: "flexion des jambes a la machine",
  aliasNorms: ["seated leg curl", "leg curl assis"],
  blob: "ischio jambiers",
});
assert.ok(
  translatedLegCurl > bicepsCurlWithLooseLegMetadata,
  "A complete translated alias must rank above a partial primary-name match"
);

const exactName = score({
  primaryNameNorm: "leg curl",
  aliasNorms: [],
  blob: "ischio jambiers",
});
assert.ok(exactName > realLegCurl, "An exact name must rank first");

const prefixQueryScore = scoreExerciseSearch({
  queryNorm: "leg cur",
  queryTokens: ["leg", "cur"],
  primaryNameNorm: "leg curl allonge",
  aliasNorms: [],
  blob: "",
});
assert.ok(prefixQueryScore > 2000, "Typing prefixes must remain useful");

console.log("Exercise search ranking: OK");

