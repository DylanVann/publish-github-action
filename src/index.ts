import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import * as semver from 'semver'
import * as tar from 'tar'

const Github = require('@actions/github')
const Octokit = require('@octokit/rest')

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
    await exec.exec(`git checkout -b ${branchName}`)

    await exec.exec(`yarn install`)
    await exec.exec(`yarn run build`)
    await exec.exec(`yarn pack`)

    // We create a branch containing only the contents of the package.
    const packagedFilename = `${name}-${version}.tgz`
    const packagedFilePath = path.join(process.cwd(), packagedFilename)
    const tempPackedFilePath = path.join(os.tmpdir(), packagedFilename)
    await fs.move(packagedFilePath, tempPackedFilePath)
    // Remove all files and folders.
    await exec.exec(`git rm -rf .`)
    await exec.exec(`git clean -fdx`)
    // Move back the package.
    await fs.move(tempPackedFilePath, packagedFilePath)
    // Extract it.
    core.info(`Extracting ${packagedFilename}`)
    await exec.exec('ls')
    await tar.extract({ file: packagedFilePath })
    await fs.remove(packagedFilePath)
    // Move from "package" into cwd.
    const filesAndDirectoriesInPackage: string[] = await fs.readdir('package')
    await Promise.all(
      filesAndDirectoriesInPackage.map(p =>
        fs.move(path.join('package', p), p),
      ),
    )
    await fs.remove('package')

    await exec.exec(`git add .`)
    await exec.exec(`git commit -a -m "release ${version}"`)
    await exec.exec(`git push origin ${branchName}`)

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
