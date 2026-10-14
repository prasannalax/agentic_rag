# MCP-Powered Agentic RAG

An intelligent AI question-answering system that searches internal knowledge first and uses web search as a fallback when the available information is insufficient.

## 📌 About the Project

**MCP-Powered Agentic RAG** is a Retrieval-Augmented Generation (RAG) application designed to provide relevant, context-aware answers using both stored knowledge and external information.

Traditional AI chatbots may provide outdated or inaccurate answers when they lack sufficient context. This project addresses that limitation by combining a local knowledge retrieval system with an intelligent fallback mechanism powered by the Model Context Protocol (MCP).

For example, if an employee asks about a company's parental leave policy, the system searches its internal knowledge base. If someone asks about a recent technology update that is not covered by the stored documents, the system can use its web-search fallback to find additional information.

## 🎯 Key Features

- **Knowledge-Based Question Answering:** Retrieves relevant information from stored documents.
- **Retrieval-Augmented Generation (RAG):** Uses retrieved context to help the AI generate more relevant answers.
- **Vector Search:** Finds semantically similar information using embeddings and MongoDB Atlas Vector Search.
- **Intelligent Fallback:** Uses an MCP-connected web-search tool when internal information is insufficient.
- **AI-Powered Responses:** Uses Groq-hosted language models to generate answers.
- **Local Embeddings:** Uses Ollama and the `nomic-embed-text` model to convert text into numerical representations.
- **Interactive Chat Interface:** Provides a React-based interface for asking questions and viewing responses.
- **Source-Aware Responses:** Helps distinguish answers based on internal knowledge from those using external search.

## ⚙️ How It Works

1. **User asks a question:** The user enters a query through the chat interface.
2. **Question processing:** The backend prepares the query for retrieval.
3. **Vector search:** The query is converted into an embedding and compared with stored document embeddings in MongoDB Atlas.
4. **Context evaluation:** The application checks whether the retrieved information is sufficient to answer the question.
5. **Fallback search:** If the internal information is insufficient, the application can invoke its MCP-connected web-search service.
6. **Answer generation:** The retrieved context is passed to the Groq-hosted language model to generate a response.
7. **Response delivery:** The answer is displayed in the chat interface.

## 🏗️ Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React.js | Interactive chat interface |
| Backend | Node.js and Express.js | API endpoints and application logic |
| AI language model | Groq API | Generates natural-language responses |
| Embeddings | Ollama with `nomic-embed-text` | Converts text and queries into embeddings |
| Database | MongoDB Atlas | Stores knowledge documents and embeddings |
| Semantic retrieval | MongoDB Atlas Vector Search | Retrieves relevant documents |
| Tool integration | Model Context Protocol (MCP) | Connects the application to external search tools |
| Web fallback | DuckDuckGo MCP search | Finds additional information when needed |

## 🌍 Real-World Applications

- **Enterprise knowledge assistants:** Answer questions about company policies and internal documentation.
- **Customer support:** Retrieve product information and search for additional details when necessary.
- **Research assistants:** Combine a collection of saved documents with external search.
- **University assistants:** Answer questions using institutional documents and seek additional information when appropriate.
- **Technical support:** Search internal troubleshooting guides before looking for external solutions.

## 🚀 Project Objectives

- Reduce dependence on a single static knowledge source.
- Improve the relevance of AI-generated answers through document retrieval.
- Enable external information discovery through MCP tool integration.
- Build a modular AI application combining retrieval, tool use, and language generation.
- Explore practical applications of RAG and agentic AI workflows.

## 🔐 Configuration and Security

API keys and database credentials must be stored in environment variables rather than committed to GitHub.

Keep your `.env` files private and provide a `.env.example` file containing placeholder values only.

## 📈 Future Enhancements

- Improve retrieval accuracy and fallback decision-making.
- Display document citations and clickable external sources.
- Add support for PDF and other document uploads.
- Introduce authentication and role-based access.
- Add automated evaluation for answer quality and retrieval relevance.
- Improve web-search result extraction and summarization.

## 👩‍💻 Project Status

This project is under development. Features and implementation details may evolve as retrieval quality, fallback behavior, and the user experience are improved.
