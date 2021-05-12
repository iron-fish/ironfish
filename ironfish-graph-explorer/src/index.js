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
        let island = islands.get(block.rootId) || [islandNext++, new Map()]
        islands.set(block.rootId, island)
        const [islandOffset, childOffsets] = island

        let childOffset = 0
        if(!block.main) {
            childOffset = childOffsets.get(block.seq)
            childOffset = childOffset === undefined ? 1 : ++childOffset
            childOffsets.set(block.seq, childOffset)
        }

        const nodeOffsetX = (islandOffset * ISLAND_OFFSET) + (childOffset * CHILD_OFFSET)
        const nodeOffsetY = block.seq * LEVEL_OFFSET

        const node = {
            hash: block.hash,
            graphId: block.graphId,
            seq: block.seq,
            prev: block.prev,
            rootId: block.rootId,
            main: block.main,
            head: block.head,
            latest: block.latest,
            graffiti: block.graffiti,
            work: BigInt(block.work),
            diff: 0,
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

function makeLabel(node) {
    return `${node.seq} ${node.hash.slice(0, 5)}...${node.hash.slice(-5)}`
}

function makeGraph() {
    console.log('Making Graph', data.length)

    let lastFrame = Date.now()

    const nodeElement = document.getElementById('node')
    const graphElement = document.getElementById('graph')
    const fpsElement = document.getElementById('fps')

    function onNodeClick(node) {
        console.log('Clicked', node)

        nodeElement.innerHTML = (
            `<b>HASH</b>   ${node.hash}<br>` +
            `<b>PREV</b>   ${node.prev}<br>` +
            `<b>SEQ</b>    ${node.seq}<br>` +
            `<b>GRAPH</b>  ${node.graphId}<br>` +
            `<b>ROOT</b>   ${node.rootId}<br>` +
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
        console.log('Background clicked')
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

    const fuse = new Fuse(nodes, {
        findAllMatches: false,
        location: 0,
        threshold: 0.1,
        distance: 1000,
        keys: [ "hash", "seq"]
    })

    function onSearch(search) {
        const results = fuse.search(search)

        if(!results.length) {
            highlightNode = null
            onBackgroundClick()
            return
        }

        const result = results[0];
        const node = nodes[result.refIndex]

        console.log('Found', node)
        highlightNode = node
        graph.zoom(0.8, 1000);
        graph.centerAt(node.x, node.y, 1000)
        onNodeClick(node)
    }

    const controls = { 'Search': '' }
    const gui = new dat.GUI()
    gui.add(controls, 'Search', '').onChange(_.debounce(onSearch, 600))
}


makeGraph()
