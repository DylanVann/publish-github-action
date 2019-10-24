import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs'
const Github = require('@actions/github');
const Octokit = require('@octokit/rest').plugin(require('@octokit/plugin-retry'));
const semver = require('semver');
const githubToken = core.getInput('github_token', { required: true });
const context = Github.context;
const octokit = new Octokit({auth: githubToken});

async function run() {
  try {
    let json = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    let version = 'v'+json.version;
    let minorVersion = 'v'+semver.major(json.version)+'.'+semver.minor(json.version);
    let majorVersion = 'v'+semver.major(json.version);
    let branchName: string = 'releases/'+version;

    let tags = await octokit.repos.listTags({owner: context.repo.owner, repo: context.repo.repo});

    if (tags.data.some((tag: {name: string}) => tag.name === version)) {
      console.log('Tag', version, 'already exists');
      return;
    }

    await exec.exec('git', ['checkout', '-b', branchName]);

    const hasYarnLock = fs.existsSync('yarn.lock');
    const packageManager = hasYarnLock ? 'yarn' : 'npm';

    const hasBuildScript = json.scripts && json.scripts.build;
    if (hasBuildScript) {
      await exec.exec(`${packageManager} install`);
      await exec.exec(`${packageManager} run build`);
      await exec.exec('rm -rf node_modules');
    }

    await exec.exec(`${packageManager} install --production`);
    await exec.exec('git config --global user.email "github-actions[bot]@users.noreply.github.com"');
    await exec.exec('git config --global user.name "github-actions[bot]"');
    await exec.exec('git remote set-url origin https://x-access-token:'+githubToken+'@github.com/'+context.repo.owner+'/'+context.repo.repo+'.git');
    await exec.exec('git add -f node_modules');
    if (json.files) {
      await exec.exec(`git add -f ${json.files.join(' ')}`);
    }
    await exec.exec('git commit -a -m "prod dependencies"');
    await exec.exec('git', ['push', 'origin', branchName]);

    await exec.exec('git', ['push', 'origin', ':refs/tags/'+version]);
    await exec.exec('git', ['tag', '-fa', version, '-m', version]);
    await exec.exec('git', ['push', 'origin', ':refs/tags/'+minorVersion]);
    await exec.exec('git', ['tag', '-f', minorVersion]);
    await exec.exec('git', ['push', 'origin', ':refs/tags/'+majorVersion]);
    await exec.exec('git', ['tag', '-f', majorVersion]);
    await exec.exec('git push --tags origin')

    await octokit.repos.createRelease({owner: context.repo.owner, repo: context.repo.repo, tag_name: version, name: version});

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();