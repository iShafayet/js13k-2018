# -*- mode: ruby -*-
# vi: set ft=ruby :
Vagrant.configure("2") do |config|
  config.vm.box = "hashicorp/bionic64"
  
  config.vm.provision :shell, path: "devops/bootstrap-vagrant.sh"

  config.vm.network :forwarded_port, guest: 3000, host: 3000
end
