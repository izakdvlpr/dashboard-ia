# Como a IA funciona no chat

A IA **nunca escreve SQL**: ela só escolhe itens de um catálogo fechado (métricas, agrupamentos, filtros).
O SQL de verdade é escrito à mão e montado pelo sistema.

```mermaid
flowchart TD
    Q(["💬 Pergunta do usuário"]) --> G

    G["🛡️ Guardrail<br/><b>granite3-guardian:8b</b><br/>pergunta é segura?"]
    G -- "não" --> X(["⛔ Bloqueada"])
    G -- "sim" --> C

    C["🧭 Classificador<br/><b>amazon/nova-micro</b><br/>que tipo de pergunta é?"]
    C -- "conversa" --> S["💡 Resposta simples<br/><b>openai/gpt-4.1-nano</b>"]
    C -- "tabela ou gráfico" --> QS

    QS["🧩 Gerador de consulta<br/><b>alibaba/qwen3-coder-30b-a3b</b><br/>escolhe métricas, filtros e período"]
    QS -- "resposta inválida:<br/>corrige 1 vez" --> QS
    QS --> DB

    DB["🗄️ Monta o SQL e consulta o banco<br/>sem IA · só leitura"]
    DB --> R["📝 Resumo em texto<br/><b>openai/gpt-4.1-nano</b>"]
    DB -- "se pediu gráfico" --> CH["📊 Monta o gráfico<br/><b>openai/gpt-4.1-nano</b>"]

    S --> F(["✅ Resposta no chat"])
    R --> F
    CH --> F

    classDef local fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef cloud fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef noai fill:#f3f4f6,stroke:#6b7280,color:#111827
    classDef stop fill:#fee2e2,stroke:#dc2626,color:#7f1d1d

    class G local
    class C,S,QS,R,CH cloud
    class DB noai
    class X stop
```

🟩 IA local (Ollama) · 🟦 IA na nuvem (Vercel AI Gateway) · ⬜ sem IA

## Modelos

| Etapa | Modelo | Onde roda |
|---|---|---|
| Guardrail (barra pergunta perigosa) | `granite3-guardian:8b` | Local (Ollama) |
| Classificador (conversa, tabela ou gráfico) | `amazon/nova-micro` | Nuvem (AI Gateway) |
| Gerador de consulta | `alibaba/qwen3-coder-30b-a3b` | Nuvem (AI Gateway) |
| Gráfico | `openai/gpt-4.1-nano` | Nuvem (AI Gateway) |
| Resposta simples e resumo | `openai/gpt-4.1-nano` | Nuvem (AI Gateway) |

## Por que é seguro

- A IA só escolhe opções de uma lista; quem escreve o SQL é o sistema.
- Tudo que vem da pergunta entra como parâmetro, nunca como texto colado no SQL.
- O banco é acessado por um usuário só de leitura, com limite de 5 segundos e 500 linhas por consulta.
