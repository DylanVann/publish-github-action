import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as semver from 'semver'
import * as tar from 'tar'

const Github = require('@actions/github')
const OctokitPluginRetry = require('@octokit/plugin-retry')
const createOctokit = require('@octokit/rest')

const Octokit = createOctokit.plugin(OctokitPluginRetry)

const githubToken = core.getInput('github_token', { required: true })
const context = Github.context
const octokit = new Octokit({ auth: githubToken })

async function run() {
  try {
    const json = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    const name = json.name
    const version = 'v' + json.version
    const minorVersion =
      'v' + semver.major(json.version) + '.' + semver.minor(json.version)
    const majorVersion = 'v' + semver.major(json.version)
    const branchName: string = 'releases/' + version

    const tags = await octokit.repos.listTags({
      owner: context.repo.owner,
      repo: context.repo.repo,
    })

    if (tags.data.some((tag: { name: string }) => tag.name === version)) {
      console.log('Tag', version, 'already exists')
      return
    }

    await exec.exec(`git checkout -b ${branchName}`)

    await exec.exec(
      'git config --global user.email "github-actions[bot]@users.noreply.github.com"',
    )
    await exec.exec('git config --global user.name "github-actions[bot]"')
    await exec.exec(
      'git remote set-url origin https://x-access-token:' +
        githubToken +
        '@github.com/' +
        context.repo.owner +
        '/' +
        context.repo.repo +
        '.git',
    )

    await exec.exec(`yarn install`)
    await exec.exec(`yarn run build`)
    await exec.exec(`yarn pack`)

    // We create a branch containing only the contents of the package.
    const packagedFilePath = path.join(__dirname, `${name}-${version}.tgz`)
    // Move it to a directory above this so that we can delete everything here.
    const tempPackedFilePath = path.join(packagedFilePath, '..')
    await fs.move(packagedFilePath, tempPackedFilePath)
    await exec.exec(`git checkout --orphan empty-branch`)
    await exec.exec(`git rm -rf .`)
    await fs.move(tempPackedFilePath, packagedFilePath)
    await tar.extract({ file: packagedFilePath })
    await fs.remove(packagedFilePath)
    await exec.exec('ls')

    return
    await exec.exec(`git commit -a -m "release ${version}"`)
    await exec.exec('git', ['push', 'origin', branchName])

    await exec.exec('git', ['push', 'origin', ':refs/tags/' + version])
    await exec.exec('git', ['tag', '-fa', version, '-m', version])
    await exec.exec('git', ['push', 'origin', ':refs/tags/' + minorVersion])
    await exec.exec('git', ['tag', '-f', minorVersion])
    await exec.exec('git', ['push', 'origin', ':refs/tags/' + majorVersion])
    await exec.exec('git', ['tag', '-f', majorVersion])
    await exec.exec('git push --tags origin')

    await octokit.repos.createRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      tag_name: version,
      name: version,
    })
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
