#File: Dockerfile
#Programmer:  Kevin Volkov
#File Description: This is the Dockerfile that defines the container for Vigil IoT's backend. It
#                  specifies the commands for installing the required dependencies so the user
#                  doesn't have to do this manually. It also opens the port my app runs on and
#                  and runs the command to start my server program.

#Use official Node.js image (version 20) as base for container.
FROM node:20

#Set container's working directory. If /app doesn't exist, Docker creates it.
WORKDIR /app

#Copy dependencies and install them from JSON files
COPY package*.json ./
RUN npm install

#Copy the rest of the app
COPY . .

#Expose the port theapp runs on
EXPOSE 3001

#Run the command to start the server
CMD ["npm", "start"]