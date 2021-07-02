import './style.css'

const data = require('./data.json')

const NODE_REL = 8
const ISLAND_OFFSET = 500
const CHILD_OFFSET = 50
const LEVEL_OFFSET = 50
const LINK_DISTANCE = 200

function getNodes() {
    const blocks = data
    const nodes = []
    const links = []
    const map = new Map()
    let lowest = null
    let highest = null

    let islandNext = 0
    const islands = new Map() // Map<number, Map<number, number>>

    console.log('Building nodes from ', data.length, 'blocks')

    for(const block of blocks) {
        let island = islands.get(block.prev) || [islandNext++, new Map()]
        islands.set(block.hash, island)
        const [islandOffset, childOffsets] = island

        let childOffset = 0

        if(!block.main) {
            childOffset = childOffsets.get(block.seq)
            childOffset = childOffset === undefined ? 1 : ++childOffset
            childOffsets.set(block.seq, childOffset)
        }

        const nodeOffsetX = (islandOffset * ISLAND_OFFSET) + (childOffset * CHILD_OFFSET)
        const nodeOffsetY = block.seq * LEVEL_OFFSET

        const graffiti = block.graffiti.replace(/\0/g, '').trim()

        // Blocks with no graffiti should be gray
        const color = graffiti ? undefined : 'rgba(255, 255, 255, 0.7)'

        const node = {
            hash: block.hash,
            seq: block.seq,
            prev: block.prev,
            main: block.main,
            head: block.head,
            latest: block.latest,
            graffiti: graffiti,
            work: BigInt(block.work),
            shortHash: renderHash(block.hash),
            diff: 0,
            color: color,
            x: nodeOffsetX,
            y: nodeOffsetY,
        }

        map.set(node.hash, node)
        nodes.push(node)

        if(!lowest || node.seq < lowest.seq) {
            lowest = node
        }

        if(!highest || node.seq > highest.seq) {
            highest = node
        }
    }

    for(const block of blocks) {
        const prev = map.get(block.prev)
        const node = map.get(block.hash)

        if(!prev || !node) continue

        const link = {
            source: block.prev,
            target: block.hash,
            targetNode: node,
            distance: LINK_DISTANCE,
            dashed: !block.main
        }

        links.push(link)

        if(prev) {
            node.diff = node.work - prev.work
        }
    }

    return [nodes, links, lowest, highest]
}

function renderHash(hash) {
    return `${hash.slice(0, 5)}...${hash.slice(-5)}`
}

function makeLabel(node) {
    return `${node.shortHash} - ${node.seq}`
}

function makeGraph() {
    console.log('Making Graph', data.length)

    let lastFrame = Date.now()

    const nodeElement = document.getElementById('node')
    const graphElement = document.getElementById('graph')
    const fpsElement = document.getElementById('fps')

    function onNodeClick(node) {
        nodeElement.innerHTML = (
            `<b>HASH</b>   ${node.hash}<br>` +
            `<b>PREV</b>   ${node.prev}<br>` +
            `<b>SEQ</b>    ${node.seq}<br>` +
            `<b>GRAFF</b>  ${node.graffiti}<br>` +
            `<b>WORK</b>   ${node.work} (+${node.diff})<br>` +
            `<b>MAIN</b>   ${node.main}<br>` +
            `<b>HEAD</b>   ${node.head}<br>` +
            `<b>LATEST</b> ${node.latest}<br>`
        ).replace(/ /g, '&nbsp;')

        nodeElement.style.display = 'block'
        highlightNode = node
    }

    function onBackgroundClick() {
        nodeElement.innerHTML = ''
        nodeElement.style.display = 'none'
        highlightNode = null
    }

    function onNodeHover(node) {
        graphElement.style.cursor = node ? 'pointer' : null
        hoverNode = node || null
    }

    function onRenderFramePost() {
        const now = Date.now()
        const delta = now - lastFrame
        const fps = 1000 / delta
        lastFrame = now
        fpsElement.innerText = `${fps.toFixed(2)} FPS`
    }

    const [nodes, links, lowest, highest] = getNodes()
    let highlightNode = null
    let hoverNode = null
    let results = []
    let resultIndex = -1

    const graph = ForceGraph()(graphElement)
        .backgroundColor('#101020')
        .cooldownTicks(0)
        .autoPauseRedraw(false)
        .dagMode(null)
        .dagLevelDistance(LEVEL_OFFSET)
        .enableNodeDrag(false)
        .nodeRelSize(NODE_REL)
        .nodeId('hash')
        .nodeLabel(node => makeLabel(node))
        .nodeAutoColorBy('graffiti')
        .nodeCanvasObjectMode(node => {
            return highlightNode === node || hoverNode === node ? 'before' : undefined
        })
        .nodeCanvasObject((node, ctx) => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, NODE_REL * 1.4, 0, 2 * Math.PI, false);
            ctx.fillStyle = node === highlightNode ? 'orange' : 'red';
            ctx.fill();
        })
        .linkColor(() => 'rgba(255, 255, 255, 0.2)')
        .linkWidth(3)
        .linkCurvature(0)
        .linkDirectionalArrowLength(6)
        .linkLineDash(link => link.dashed && [6, 6])
        .onNodeClick(onNodeClick)
        .onNodeHover(onNodeHover)
        .onBackgroundClick(onBackgroundClick)
        .onRenderFramePost(onRenderFramePost)

    graph.graphData({ nodes, links })

    nodes.forEach((node) => {
        node.fx = node.x
        node.fy = node.y
    })

    graph.onEngineStop(() => {
        graph.zoom(0.8, 0)
        graph.centerAt(highest.x, highest.y, 0)
    })

    const controls = {
        Search: '',
        Next: () => onNextResult(),
        Prev: () => onPrevResult(),
    }

    const gui = new dat.GUI()
    gui.add(controls, 'Search', '').onChange(_.debounce(onSearch, 600))
    const nextButton = gui.add(controls, 'Next')
    const prevButton = gui.add(controls, 'Prev')
    nextButton.__li.style.display = 'none'
    prevButton.__li.style.display = 'none'

    const fuse = new Fuse(nodes, {
        findAllMatches: false,
        location: 0,
        threshold: 0.1,
        distance: 1000,
        keys: [ "shortHash", "hash", "seq"]
    })

    function onNextResult() {
        if(results.length === 0) return

        resultIndex = (resultIndex + 1) % results.length

        const result = results[resultIndex]
        const node = nodes[result.refIndex]
        selectNode(node)
    }

    function onPrevResult() {
        if(results.length === 0) return

        resultIndex--
        if(resultIndex <= 0) resultIndex = results.length - 1

        const result = results[resultIndex]
        const node = nodes[result.refIndex]
        selectNode(node)
    }

    function onSearch(search) {
        results = fuse.search(search)
        resultIndex = -1

        if(!results.length) {
            selectNode(null)
            nextButton.__li.style.display = 'none'
            prevButton.__li.style.display = 'none'
            return
        }

        console.log('Found Results', results.length)

        nextButton.__li.style.display = ''
        prevButton.__li.style.display = ''
        onNextResult()
    }

    function selectNode(node) {
        if (!node) {
            highlightNode = null
            onBackgroundClick()
            return
        }

        highlightNode = node
        graph.zoom(0.8, 1000);
        graph.centerAt(node.x, node.y, 1000)
        onNodeClick(node)

        console.log('Selected', resultIndex, node)
    }
}

makeGraph()
