FROM python AS build

RUN apt-get update && apt-get install -y \
    ffmpeg \
    nano \
    htop \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip

RUN adduser norman
USER norman
WORKDIR /home/norman

ENV PATH="/home/norman/.local/bin:${PATH}"
RUN mkdir flowiz
COPY --chown=norman:norman requirements.txt /home/norman/flowiz/requirements.txt
RUN cd /home/norman/flowiz && pip install --user -r requirements.txt

COPY --chown=norman:norman . /home/norman/flowiz/

FROM build 
RUN cd /home/norman/flowiz && python setup.py install --user
EXPOSE 8000
CMD python -m flowiz.gui --mode None