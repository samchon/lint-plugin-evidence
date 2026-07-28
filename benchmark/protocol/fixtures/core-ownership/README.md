# Core ownership fixtures

The runner validates `grading-input-cases.json` against the named schema. The `valid` record must pass. Each `invalidPatches` record is merged onto that record and must fail for the stated reason. This proves that the core seal hashes a closed pre-seal grading-input manifest without asking that manifest to hash the seal itself.
