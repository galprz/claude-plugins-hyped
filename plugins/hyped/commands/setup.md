Use the hyped-projects skill to guide the user through registering a new project.

Ask for the project name, then the working directory path (accept voice input — normalize paths like "slash Users slash gal" to actual paths), confirm with the user, then write to ~/.hyped/projects.json.

After registering, remind the user they can switch to it with `/project switch <name>`.
