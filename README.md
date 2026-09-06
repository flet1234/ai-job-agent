
# AI Job Search Agent  

User passes Job description to Agent and users real qualifications and experience, with it agent do job analysis and profile comparison, and after agent will return updated and adjusted CV and Cover letter if needed

Web is UI which is getting user inputs, validate them, and passing them to api

Api is Backend that validate it, and passing inputs to LLM, that will return updated CV and cover letter, then it return to ui updated versions.

Shared is a shared types and validation, that is common for UI and API, we do this so UI don't have Api dependencies so we keep server code outside of a browser.
