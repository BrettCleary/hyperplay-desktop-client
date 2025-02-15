import * as os from 'os'
import * as child_process from 'child_process'
import axios from 'axios'
import * as fs from 'fs'
import * as YAML from 'yaml'

async function downloadAllReleaseAssets() {
  console.log('tag name: ', process.env.RELEASE_VERSION)
  const useTestRepo = true
  const repoOrgName = useTestRepo ? 'BrettCleary' : 'HyperPlay-Gaming'

  // download all artifacts
  console.log('downloading mac x64, mac arm64, and windows x64 releases')
  const { data } = await axios.get(
    `https://api.github.com/repos/${repoOrgName}/hyperplay-desktop-client/releases/latest`
  )

  const destDir = `${os.tmpdir()}/assets`
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir)
  }
  // download each asset in the latest release
  for (const key of Object.keys(data.assets)) {
    const asset = data.assets[key]
    const downloadUrl = asset.browser_download_url

    const outputFile = `${os.tmpdir()}/${asset.name}`

    console.log(
      'downloading from ',
      downloadUrl,
      ' to output file ',
      outputFile
    )
    child_process.spawnSync('curl', [
      '-L',
      downloadUrl,
      '-o',
      outputFile,
      '--create-dirs'
    ])
  }

  return data.assets
}

/* eslint-disable-next-line */
function writeHpConfig(assets: any) {
  // write hyperplay.yml
  /* eslint-disable-next-line */
  const hpCliConfig: Record<string, any> = {
    account: 'hyperplaycd',
    project: 'desktoptest',
    release: process.env.RELEASE_VERSION
  }

  /* eslint-disable-next-line */
  const platforms: Record<string, any> = {}
  for (const asset of assets) {
    platforms[asset.name] = {
      path: `${os.tmpdir()}/${asset.name}`,
      zip: false
    }
  }
  hpCliConfig.platforms = platforms

  const dest = `${os.tmpdir()}/assets/hyperplay.yml`
  console.log('writing hyperplay CLI YAML config file to ', dest)
  fs.writeFileSync(dest, YAML.stringify(hpCliConfig))
  return dest
}

async function spawnAsyncWithLiveOutput(dest: string) {
  return new Promise((res, rej) => {
    let scriptOutput = ''
    const child = child_process.spawn(
      `hyperplay publish --private-key=${process.env.VALIST_PUBLISH_KEY} --yml-path=${dest} --skip_hyperplay_publish --use-yml`,
      { shell: true }
    )

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', function (data) {
      //Here is where the output goes

      console.log('stdout: ' + data)

      data = data.toString()
      scriptOutput += data
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', function (data) {
      //Here is where the error output goes

      console.log('stderr: ' + data)

      data = data.toString()
      scriptOutput += data
    })

    child.on('error', function (err) {
      console.log('Full output of script: ', scriptOutput)
      rej(`Error during publish ${err}`)
    })

    child.on('close', function (code) {
      console.log('closing code: ' + code)
      console.log('Full output of script: ', scriptOutput)
      if (code) {
        rej(code)
      } else {
        res(code)
      }
    })
  })
}

async function main() {
  const assets = await downloadAllReleaseAssets()

  const dest = writeHpConfig(assets)

  // call hyperplay cli
  console.log('publishing to Valist')
  await spawnAsyncWithLiveOutput(dest)
  // const child = child_process.spawnSync(
  //   `hyperplay publish --private-key=${process.env.VALIST_PUBLISH_KEY} --yml-path=${dest} --skip_hyperplay_publish --use-yml`,
  //   { shell: true }
  // )
  // if (child.error) {
  //   console.error(`ERROR: ${child.error}`)
  // }
  // console.log('stdout: ', child.stdout.toString())
  // console.log('stderr: ', child.stderr.toString())
  // console.log('exit code: ', child.status)
}

main()
