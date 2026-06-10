
we usually do not have access to human-annotated datasets or reference answers. We therefore focus on metrics that are fully self-contained and reference-free. We focus in particular three quality aspects, which we argue are of central importance. First, Faithfulness refers to the idea that the answer should be grounded in the given context. This is important to avoid hallucinations, and to ensure that the retrieved context can act as a justification for the generated answer. Indeed, RAG systems are often used in applications where the factual consistency of the generated text w.r.t. the grounded sources is highly important, e.g. in domains such as law, where information is constantly evolving. Second, Answer Relevance refers to the idea that the generated answer should address the actual question that was provided. Finally, Context Relevance refers to the idea that the retrieved context should be focused, containing as little irrelevant information as possible. This is important given the cost associated with feeding long context passages to LLMs. Moreover, when context passages are too long, LLMs are often less effective in exploiting that context, especially for information that is provided in the middle of the context passage (Liu et al., 2023).


We now explain how these three quality aspects can be measured in a fully automated way, by prompting an LLM. In our implementation and experiments, all prompts are evaluated using the gpt-3.5-turbo-16k model, which is available through the OpenAI API 2 .


Faithfulness We say that the answer a s ( q ) is faithful to the context c ( q ) if the claims that are made in the answer can be inferred from the context. To estimate faithfulness, we first use an LLM to extract a set of statements, S ( a s ( q )) . The aim of this step is to decompose longer sentences into shorter and more focused assertions. We use the following prompt for this step 3 :


Given a question and answer, create one or more statements from each sentence


in the given answer. question: [question] answer: [answer]


where [question] and [answer] refer to the given question and answer. For each statement s i in S , the LLM determines if s i can be inferred from c ( q ) using a verification function v ( s i , c ( q )) . This verification step is carried out using the following prompt:


2 https://platform.openai.com


3 To help clarify the task, we include a demonstration as part of the prompt. This demonstration is not explicitly shown in the listing of the prompts throughout this paper.


where [question] and [answer] refer to the given question and answer. For each statement s i in S , the LLM determines if s i can be inferred from c ( q ) using a verification function v ( s i , c ( q )) . This verification step is carried out using the following prompt:


Consider the given context and following statements, then determine whether they are supported by the information present in the context. Provide a brief explanation for each statement before arriving at the verdict (Yes/No). Provide a final verdict for each statement in order at the end in the given format. Do not deviate from the specified format.


statement:


[statement 1]


...


[statement n ]


statement:


The final faithfulness score, F , is then computed as F = | V | | S | , where | V | is the number of statements that were supported according to the LLM and | S | is the total number of statements.


Answer relevance We say that the answer a s ( q ) is relevant if it directly addresses the question in an appropriate way. In particular, our assessment of answer relevance does not take into account factuality, but penalises cases where the answer is incomplete or where it contains redundant information. To estimate answer relevance, for the given answer a s ( q ) , we prompt the LLM to generate n potential questions q i based on a s ( q ) , as follows:


Generate a question for the given answer. answer : [answer]


We then obtain embeddings for all questions using the text-embedding-ada-002 model, available from the OpenAI API. For each q i , we calculate the similarity sim ( q, q i ) with the original question q , as the cosine between the corresponding embeddings. The answer relevance score, AR, for question q is then computed as:


$$
A R = \frac { 1 } { n } \sum _ { i = 1 } ^ { n } \sin ( q , q _ { i } )
$$


This metric evaluates how closely the generated answer aligns with the initial question or instruction.


Context relevance The context c ( q ) is considered relevant to the extent that it exclusively contains information that is needed to answer the question. In particular, this metric aims to penalise the
