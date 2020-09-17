require('dotenv').config()
const puppeteer = require('puppeteer');
const axios = require('axios')
const fs = require('fs')
const { WORKSPACE, TOKEN, HOST, OUTPUT_DIR } = process.env

const savePageSource = async (pageId, path) => {
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setCookie({
      name: 'cloud.session.token',
      value: TOKEN,
      domain: '.atlassian.net'
    })
    await page.goto(`${HOST}/wiki/plugins/viewsource/viewpagesrc.action?pageId=${pageId}`, {
      waitUntil: 'networkidle2'
    });
    await page.pdf({
      path,
      format: 'A4',
      margin: {
        top: '0.5cm',
        right: '0.5cm',
        bottom: '0.5cm',
        left: '0.5cm'
      }
    })
  } catch (e) {
    console.log(e)
  } finally {
    await browser.close();
  }
}

const fetchDirectory = async (pageId) => {
  const params = (() => {
    if (pageId === 'root') {
      return {
        spaceKey: WORKSPACE,
        node: 'root'
      }
    }
    return {
      pageId
    }
  })()
  try {
    const { data } = await axios({
      method: 'get',
      url: `${HOST}/wiki/pages/children.action`,
      params,
      headers: {
        cookie: `cloud.session.token=${TOKEN}`
      }
    })
    return data
  } catch(e) {
    console.error(e)
  }
}

const mkdir = async (path) => {
  try {
    await fs.mkdirSync(path)
  } catch (e) {
    console.info('Failed to create directory: ', e)
  }
}

const escapeString = (str) => {
  return str.replace(/(['"\/|])/g, '_')
}

const saveDirectory = async (pageId, path) => {
  console.time(pageId)
  const pages = await fetchDirectory(pageId)
  if (pageId === 'root') {
    const page = pages[0]
    const key = `${path}/${WORKSPACE}`
    await mkdir(key)
    return saveDirectory(page.pageId, key)
  }
  for (const page of pages) {
    const key = `${path}/${escapeString(page.text)}`
    if (page.nodeClass === 'closed') {
      await mkdir(key)
      await savePageSource(page.pageId, `${key}/index.pdf`)
      await saveDirectory(page.pageId, key)
    } else {
      await savePageSource(page.pageId, `${key}.pdf`)
    }
  }
  console.timeEnd(pageId)
}

if (!WORKSPACE || !TOKEN || !HOST || !OUTPUT_DIR) {
  console.error('Some value not provided!', { WORKSPACE, TOKEN, HOST, OUTPUT_DIR })
} else {
  saveDirectory('root', OUTPUT_DIR)
}
