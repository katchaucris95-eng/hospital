
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_DIR = path.join(__dirname, "../frontend");
const DB_FILE = path.join(__dirname, "db.json");

// ======================================
// CONFIGURAÇÕES
// ======================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================
// BANCO DE DADOS
// ======================================

function criarBancoInicial() {
    return {
        usuarios: [],
        pacientes: [],
        triagens: [],
        consultas: [],
        chamadas: [],
        estoque: [],
        historicoEstoque: []
    };
}

function writeDB(db) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(db, null, 2),
        "utf8"
    );
}

function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        const inicial = criarBancoInicial();
        writeDB(inicial);
        return inicial;
    }

    const conteudo = fs.readFileSync(DB_FILE, "utf8");

    let db;

    try {
        db = conteudo.trim()
            ? JSON.parse(conteudo)
            : criarBancoInicial();
    } catch (erro) {
        throw new Error("O arquivo db.json contém JSON inválido.");
    }

    db.usuarios ??= [];
    db.pacientes ??= [];
    db.triagens ??= [];
    db.consultas ??= [];
    db.chamadas ??= [];
    db.estoque ??= [];
    db.historicoEstoque ??= [];

    return db;
}

function gerarId(lista) {
    let id = Date.now();

    while (lista.some(item => String(item.id) === String(id))) {
        id++;
    }

    return id;
}

function registrarHistorico(db, dados) {
    db.historicoEstoque.unshift({
        id: gerarId(db.historicoEstoque),
        ...dados,
        data: new Date().toISOString()
    });

    db.historicoEstoque = db.historicoEstoque.slice(0, 100);
}

// Prepara o banco ao iniciar.
try {
    readDB();
} catch (erro) {
    console.error("Erro ao preparar o banco:", erro.message);
}

// ======================================
// FRONTEND
// ======================================

app.get("/", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use(express.static(FRONTEND_DIR));

// ======================================
// ATENDIMENTO
// ======================================

app.post("/atendimento", (req, res) => {
    try {
        const nome = String(req.body.nome || "").trim();

        if (!nome) {
            return res.status(400).json({
                erro: "Informe o nome do paciente."
            });
        }

        const db = readDB();

        const paciente = {
            id: gerarId(db.pacientes),
            nome,
            cpf: String(req.body.cpf || "").trim(),
            tipo: String(req.body.tipo || "Atendimento").trim(),
            status: "aguardando_triagem",
            createdAt: new Date().toISOString()
        };

        db.pacientes.push(paciente);
        writeDB(db);

        return res.status(201).json({
            sucesso: true,
            mensagem: "Atendimento cadastrado.",
            paciente
        });
    } catch (erro) {
        console.error("Erro no atendimento:", erro);

        return res.status(500).json({
            erro: "Erro ao salvar atendimento."
        });
    }
});

app.get("/atendimento", (req, res) => {
    try {
        const db = readDB();

        const pacientes = [
            ...db.pacientes,
            ...db.triagens
        ];

        const unicos = [
            ...new Map(
                pacientes.map(p => [String(p.id), p])
            ).values()
        ];

        return res.json(unicos);
    } catch (erro) {
        console.error("Erro ao listar atendimentos:", erro);

        return res.status(500).json({
            erro: "Erro ao listar atendimentos."
        });
    }
});

// ======================================
// TRIAGEM
// ======================================

app.post("/triagem", (req, res) => {
    try {
        const nome = String(req.body.nome || "").trim();

        if (!nome) {
            return res.status(400).json({
                erro: "Informe o nome do paciente."
            });
        }

        const db = readDB();

        const temperaturaTexto = req.body.temperatura;
        const saturacaoTexto = req.body.saturacao;

        const temperatura =
            temperaturaTexto === "" ||
            temperaturaTexto === undefined ||
            temperaturaTexto === null
                ? NaN
                : Number(temperaturaTexto);

        const saturacao =
            saturacaoTexto === "" ||
            saturacaoTexto === undefined ||
            saturacaoTexto === null
                ? NaN
                : Number(saturacaoTexto);

        const sintoma = String(req.body.sintoma || "")
            .trim()
            .toLowerCase();

        let risco = "verde";

        const sinaisGraves = [
            "infarto",
            "avc",
            "hemorragia"
        ];

        const sinaisModerados = [
            "febre",
            "dor",
            "falta_ar"
        ];

        if (
            sinaisGraves.includes(sintoma) ||
            (Number.isFinite(temperatura) && temperatura >= 39) ||
            (Number.isFinite(saturacao) && saturacao < 92)
        ) {
            risco = "vermelho";
        } else if (
            (Number.isFinite(temperatura) && temperatura >= 38) ||
            sinaisModerados.includes(sintoma)
        ) {
            risco = "amarelo";
        }

        const triagem = {
            ...req.body,
            id: gerarId(db.triagens),
            nome,
            risco,
            status: "aguardando_medico",
            createdAt: new Date().toISOString()
        };

        db.triagens.push(triagem);
        writeDB(db);

        return res.status(201).json({
            sucesso: true,
            mensagem: "Triagem salva com sucesso.",
            triagem
        });
    } catch (erro) {
        console.error("Erro na triagem:", erro);

        return res.status(500).json({
            erro: "Erro ao salvar triagem."
        });
    }
});

app.get("/triagens", (req, res) => {
    try {
        return res.json(readDB().triagens);
    } catch (erro) {
        console.error("Erro ao listar triagens:", erro);

        return res.status(500).json({
            erro: "Erro ao listar triagens."
        });
    }
});

// ======================================
// CHAMADAS DA TV
// ======================================

app.get("/TV/chamada", (req, res) => {
    try {
        const db = readDB();

        res.set("Cache-Control", "no-store");

        return res.json({
            chamada: db.chamadas[0] || null,
            historico: db.chamadas.slice(0, 10)
        });
    } catch (erro) {
        console.error("Erro ao consultar chamadas:", erro);

        return res.status(500).json({
            erro: "Erro ao consultar a TV."
        });
    }
});

app.post("/TV/chamar", (req, res) => {
    try {
        const paciente = String(req.body.paciente || "").trim();
        const localTipo = String(req.body.localTipo || "GUICHÊ").trim();
        const localNumero = String(req.body.localNumero || "01").trim();

        if (!paciente) {
            return res.status(400).json({
                erro: "Informe o nome do paciente."
            });
        }

        const db = readDB();

        const chamada = {
            id: gerarId(db.chamadas),
            paciente,
            localTipo,
            localNumero,
            data: new Date().toISOString()
        };

        db.chamadas.unshift(chamada);
        db.chamadas = db.chamadas.slice(0, 10);

        writeDB(db);

        return res.status(201).json({
            sucesso: true,
            chamada
        });
    } catch (erro) {
        console.error("Erro ao chamar paciente:", erro);

        return res.status(500).json({
            erro: "Erro ao chamar paciente."
        });
    }
});

// ======================================
// CONSULTAS MÉDICAS
// ======================================

app.post("/consulta", (req, res) => {
    try {
        const db = readDB();

        const consulta = {
            id: gerarId(db.consultas),
            paciente: String(req.body.paciente || "").trim(),
            diagnostico: String(req.body.diagnostico || "").trim(),
            medicacao: String(req.body.medicacao || "").trim(),
            obs: String(req.body.obs || "").trim(),
            createdAt: new Date().toISOString()
        };

        if (!consulta.paciente) {
            return res.status(400).json({
                erro: "Informe o nome do paciente."
            });
        }

        db.consultas.push(consulta);
        writeDB(db);

        return res.status(201).json({
            sucesso: true,
            consulta
        });
    } catch (erro) {
        console.error("Erro ao salvar consulta:", erro);

        return res.status(500).json({
            erro: "Erro ao salvar consulta."
        });
    }
});

app.get("/medicacoes", (req, res) => {
    try {
        return res.json(readDB().consultas);
    } catch (erro) {
        console.error("Erro ao listar consultas:", erro);

        return res.status(500).json({
            erro: "Erro ao listar consultas."
        });
    }
});

app.get("/lista-medicacoes", (req, res) => {
    return res.json([
        "Dipirona",
        "Paracetamol",
        "Ibuprofeno",
        "Amoxicilina",
        "Azitromicina",
        "Loratadina",
        "Omeprazol",
        "Buscopan",
        "Dramin",
        "Soro fisiológico"
    ]);
});

// ======================================
// USUÁRIOS
// ======================================

app.post("/usuarios", (req, res) => {
    try {
        const usuario = String(req.body.usuario || "").trim();
        const senha = String(req.body.senha || "");
        const tipo = String(req.body.tipo || "").trim().toLowerCase();

        if (!usuario || !senha || !tipo) {
            return res.status(400).json({
                erro: "Preencha todos os campos."
            });
        }

        if (!["atendimento", "triagem", "medico"].includes(tipo)) {
            return res.status(400).json({
                erro: "Setor inválido."
            });
        }

        const db = readDB();

        const existe = db.usuarios.some(
            u => String(u.usuario).toLowerCase() === usuario.toLowerCase()
        );

        if (existe) {
            return res.status(409).json({
                erro: "Usuário já cadastrado."
            });
        }

        const novo = {
            id: gerarId(db.usuarios),
            usuario,
            senha,
            tipo
        };

        db.usuarios.push(novo);
        writeDB(db);

        return res.status(201).json({
            sucesso: true,
            mensagem: "Usuário cadastrado.",
            usuario: {
                id: novo.id,
                usuario: novo.usuario,
                tipo: novo.tipo
            }
        });
    } catch (erro) {
        console.error("Erro ao cadastrar usuário:", erro);

        return res.status(500).json({
            erro: "Erro ao cadastrar usuário."
        });
    }
});

app.post("/login", (req, res) => {
    try {
        const db = readDB();

        const usuario = String(req.body.usuario || "").trim();
        const senha = String(req.body.senha || "");

        const encontrado = db.usuarios.find(u =>
            String(u.usuario).toLowerCase() === usuario.toLowerCase() &&
            u.senha === senha
        );

        if (!encontrado) {
            return res.status(401).json({
                erro: "Usuário ou senha inválidos."
            });
        }

        const { senha: senhaArmazenada, ...dadosUsuario } = encontrado;

        return res.json(dadosUsuario);
    } catch (erro) {
        console.error("Erro no login:", erro);

        return res.status(500).json({
            erro: "Erro no login."
        });
    }
});

app.get("/usuarios", (req, res) => {
    try {
        const usuarios = readDB().usuarios.map(
            ({ senha, ...usuario }) => usuario
        );

        return res.json(usuarios);
    } catch (erro) {
        console.error("Erro ao listar usuários:", erro);

        return res.status(500).json({
            erro: "Erro ao listar usuários."
        });
    }
});

// ======================================
// ALMOXARIFADO / ESTOQUE
// ======================================

// LISTAR MEDICAMENTOS
app.get("/estoque", (req, res) => {
    try {
        const db = readDB();
        return res.json(db.estoque);
    } catch (erro) {
        console.error("Erro ao listar estoque:", erro);

        return res.status(500).json({
            erro: "Erro ao listar estoque."
        });
    }
});

// HISTÓRICO DE MOVIMENTAÇÕES
app.get("/estoque/historico", (req, res) => {
    try {
        const db = readDB();
        return res.json(db.historicoEstoque);
    } catch (erro) {
        console.error("Erro ao listar histórico:", erro);

        return res.status(500).json({
            erro: "Erro ao listar histórico."
        });
    }
});

// CADASTRAR MEDICAMENTO
app.post("/estoque", (req, res) => {
    try {
        const nome = String(req.body.nome || "").trim();
        const unidade = String(req.body.unidade || "").trim();
        const categoria = String(req.body.categoria || "").trim();
        const quantidade = Number(req.body.quantidade);

        if (!nome || !unidade || !categoria) {
            return res.status(400).json({
                erro: "Preencha todos os campos do medicamento."
            });
        }

        if (!Number.isInteger(quantidade) || quantidade <= 0) {
            return res.status(400).json({
                erro: "Informe uma quantidade inteira maior que zero."
            });
        }

        const db = readDB();

        const existe = db.estoque.some(m =>
            String(m.nome).toLowerCase() === nome.toLowerCase()
        );

        if (existe) {
            return res.status(409).json({
                erro: "Esse medicamento já está cadastrado. Utilize a opção Repor Existente."
            });
        }

        const medicamento = {
            id: gerarId(db.estoque),
            nome,
            quantidade,
            unidade,
            categoria,
            createdAt: new Date().toISOString()
        };

        db.estoque.push(medicamento);

        registrarHistorico(db, {
            medicamentoId: medicamento.id,
            nome: medicamento.nome,
            tipo: "cadastro",
            quantidade,
            unidade,
            responsavel: String(req.body.responsavel || "Almoxarifado")
        });

        writeDB(db);

        return res.status(201).json({
            sucesso: true,
            mensagem: "Medicamento cadastrado com sucesso!",
            medicamento
        });
    } catch (erro) {
        console.error("Erro ao cadastrar medicamento:", erro);

        return res.status(500).json({
            erro: "Erro ao cadastrar medicamento."
        });
    }
});

// REPOR OU RETIRAR QUANTIDADE
// Número positivo: adiciona.
// Número negativo: retira.
app.patch("/estoque/:id", (req, res) => {
    try {
        const id = req.params.id;
        const quantidade = Number(req.body.quantidade);

        if (!Number.isInteger(quantidade) || quantidade === 0) {
            return res.status(400).json({
                erro: "Informe uma quantidade inteira diferente de zero."
            });
        }

        const db = readDB();

        const medicamento = db.estoque.find(
            m => String(m.id) === String(id)
        );

        if (!medicamento) {
            return res.status(404).json({
                erro: "Medicamento não encontrado."
            });
        }

        const novaQuantidade = Number(medicamento.quantidade) + quantidade;

        if (novaQuantidade < 0) {
            return res.status(400).json({
                erro: "Não há quantidade suficiente para essa retirada."
            });
        }

        medicamento.quantidade = novaQuantidade;
        medicamento.updatedAt = new Date().toISOString();

        registrarHistorico(db, {
            medicamentoId: medicamento.id,
            nome: medicamento.nome,
            tipo: quantidade > 0 ? "entrada" : "retirada",
            quantidade: Math.abs(quantidade),
            unidade: medicamento.unidade,
            responsavel: String(req.body.responsavel || "Almoxarifado"),
            observacao: String(req.body.observacao || "")
        });

        writeDB(db);

        return res.json({
            sucesso: true,
            mensagem: "Estoque atualizado com sucesso!",
            medicamento
        });
    } catch (erro) {
        console.error("Erro ao atualizar estoque:", erro);

        return res.status(500).json({
            erro: "Erro ao atualizar estoque."
        });
    }
});

// EXCLUIR MEDICAMENTO
app.delete("/estoque/:id", (req, res) => {
    try {
        const id = req.params.id;
        const db = readDB();

        const indice = db.estoque.findIndex(
            m => String(m.id) === String(id)
        );

        if (indice === -1) {
            return res.status(404).json({
                erro: "Medicamento não encontrado."
            });
        }

        const [medicamento] = db.estoque.splice(indice, 1);

        registrarHistorico(db, {
            medicamentoId: medicamento.id,
            nome: medicamento.nome,
            tipo: "exclusao",
            quantidade: medicamento.quantidade,
            unidade: medicamento.unidade,
            responsavel: "Almoxarifado"
        });

        writeDB(db);

        return res.json({
            sucesso: true,
            mensagem: "Medicamento removido com sucesso."
        });
    } catch (erro) {
        console.error("Erro ao remover medicamento:", erro);

        return res.status(500).json({
            erro: "Erro ao remover medicamento."
        });
    }
});

// ======================================
// STATUS DO SERVIDOR
// ======================================

app.get("/status", (req, res) => {
    return res.json({
        funcionando: true,
        mensagem: "Servidor do Hospital System funcionando.",
        data: new Date().toISOString()
    });
});

// ======================================
// ROTAS INVÁLIDAS E ERROS
// ======================================

app.use((req, res) => {
    return res.status(404).json({
        erro: `Rota não encontrada: ${req.method} ${req.originalUrl}`
    });
});

app.use((erro, req, res, next) => {
    console.error("Erro no servidor:", erro);

    if (res.headersSent) {
        return next(erro);
    }

    return res.status(500).json({
        erro: "Erro interno no servidor."
    });
});

// ======================================
// INICIALIZAÇÃO
// ======================================

app.listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------------");
    console.log("Hospital System iniciado!");
    console.log(`Servidor: http://localhost:${PORT}`);
    console.log(`Status:   http://localhost:${PORT}/status`);
    console.log("--------------------------------------");
});
