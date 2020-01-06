"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec");
const github_1 = require("@actions/github");
const semver_1 = __importDefault(require("semver"));
const commit_analyzer_1 = require("@semantic-release/commit-analyzer");
const SEPARATOR = "==============================================";
function exec(command) {
    return __awaiter(this, void 0, void 0, function* () {
        let stdout = "";
        let stderr = "";
        try {
            const options = {
                listeners: {
                    stdout: (data) => {
                        stdout += data.toString();
                    },
                    stderr: (data) => {
                        stderr += data.toString();
                    }
                }
            };
            const code = yield exec_1.exec(command, undefined, options);
            return {
                code,
                stdout,
                stderr
            };
        }
        catch (err) {
            return {
                code: 1,
                stdout,
                stderr,
                error: err
            };
        }
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const defaultBump = core.getInput("default_bump");
            const tagPrefix = core.getInput("tag_prefix");
            const releaseBranches = core.getInput("release_branches");
            const createAnnotatedTag = core.getInput("create_annotated_tag");
            const { GITHUB_REF, GITHUB_SHA, GITHUB_REPOSITORY } = process.env;
            if (!GITHUB_REF) {
                core.setFailed("Missing GITHUB_REF");
                return;
            }
            if (!GITHUB_SHA) {
                core.setFailed("Missing GITHUB_SHA");
                return;
            }
            if (createAnnotatedTag && !GITHUB_REPOSITORY) {
                core.setFailed("Missing GITHUB_REPOSITORY");
                return;
            }
            const preRelease = releaseBranches
                .split(",")
                .every(branch => !GITHUB_REF.replace("refs/heads/", "").match(branch));
            const hasTag = !!(yield exec("git tag")).stdout.trim();
            let tag = "";
            let logs = "";
            if (hasTag) {
                const previousTagSha = (yield exec("git rev-list --tags --max-count=1")).stdout.trim();
                tag = (yield exec(`git describe --tags ${previousTagSha}`)).stdout.trim();
                logs = (yield exec(`git log ${tag}..HEAD --pretty=format:'%s%n%b${SEPARATOR}' --abbrev-commit`)).stdout.trim();
                if (previousTagSha === GITHUB_SHA) {
                    core.debug("No new commits since previous tag. Skipping...");
                    core.setOutput("previous_tag", tag);
                    return;
                }
            }
            else {
                tag = "0.0.0";
                logs = (yield exec(`git log --pretty=format:'%s%n%b${SEPARATOR}' --abbrev-commit`)).stdout.trim();
                core.setOutput("previous_tag", tag);
            }
            const commits = logs.split(SEPARATOR).map(x => ({ message: x }));
            const bump = yield commit_analyzer_1.analyzeCommits({}, { commits, logger: { log: core.debug.bind(core) } });
            const newTag = `${tagPrefix}${semver_1.default.inc(tag, bump || defaultBump)}${preRelease ? `-${GITHUB_SHA.slice(0, 7)}` : ""}`;
            core.setOutput("new_tag", newTag);
            core.debug(`New tag: ${newTag}`);
            if (preRelease) {
                core.debug("This branch is not a release branch. Skipping the tag creation.");
                return;
            }
            const octokit = new github_1.GitHub(core.getInput("github_token"));
            if (createAnnotatedTag) {
                core.debug(`Creating annotated tag`);
                const tagCreateResponse = yield octokit.git.createTag(Object.assign(Object.assign({}, github_1.context.repo), { tag: newTag, message: newTag, object: GITHUB_SHA, type: "commit" }));
                core.debug(`tagCreateResponse: ${JSON.stringify(tagCreateResponse)}`);
                core.debug(`Pushing annotated tag to the repo`);
                yield octokit.git.createRef(Object.assign(Object.assign({}, github_1.context.repo), { ref: `refs/tags/${newTag}`, sha: tagCreateResponse.data.sha }));
                return;
            }
            core.debug(`Pushing new tag to the repo`);
            yield octokit.git.createRef(Object.assign(Object.assign({}, github_1.context.repo), { ref: `refs/tags/${newTag}`, sha: GITHUB_SHA }));
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
